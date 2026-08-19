import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import {
  AUDIT,
  LEAVE_TYPES,
  DEDUCTING_LEAVE_TYPES,
  attendanceStatusForLeave,
} from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import {
  requireAuth,
  requirePermission,
  can,
  assertNotSelfAction,
  visibleUsersFilter,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { addDays } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mine = req.query.scope !== 'all';
    if (!mine && !can(req.user, 'leave.approve')) throw new HttpError(403, 'Not allowed');

    const requests = await prisma.leaveRequest.findMany({
      where: {
        ...(mine ? { userId: req.user.id } : { user: visibleUsersFilter(req.user) }),
        ...(req.query.status ? { status: String(req.query.status) } : {}),
      },
      include: {
        user: { select: { id: true, name: true, employeeId: true, departmentId: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ requests });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.enum(LEAVE_TYPES),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(3, 'Tell us why so it can be approved quickly'),
      })
      .parse(req.body);

    if (body.toDate < body.fromDate) throw new HttpError(400, 'End date is before start date');

    const request = await prisma.leaveRequest.create({
      data: { ...body, userId: req.user.id },
      include: { user: { select: { name: true, employeeId: true } } },
    });
    await logAudit(
      req.user,
      AUDIT.LEAVE_REQUESTED,
      'LeaveRequest',
      request.id,
      `Requested ${body.type} leave ${body.fromDate} → ${body.toDate}`,
      body
    );
    res.status(201).json({ request });
  })
);

router.post(
  '/:id/review',
  requirePermission('leave.approve'),
  asyncHandler(async (req, res) => {
    const { decision, note, isPaid } = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT']),
        note: z.string().nullish(),
        // The approver decides whether this leave costs the employee money.
        // true = "Paid", which deducts a day per day (see DEDUCTING_LEAVE_TYPES).
        // Defaults to the leave type's convention, but the decision is theirs.
        isPaid: z.boolean().optional(),
      })
      .parse(req.body);

    const request = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!request) throw new HttpError(404, 'Request not found');

    // Section 7.2 — an Admin can never approve their own leave.
    assertNotSelfAction(req.user, request.userId, 'leave');
    if (request.status !== 'PENDING') throw new HttpError(400, 'This request was already decided');

    const approved = decision === 'APPROVE';
    const paid = isPaid ?? DEDUCTING_LEAVE_TYPES.includes(request.type);
    const moneyNote = paid ? 'paid — a day of salary is deducted' : 'unpaid — no deduction';
    const updated = await prisma.leaveRequest.update({
      where: { id: request.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        isPaid: approved ? paid : null,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    // Approved leave writes straight into attendance so salary and work rules
    // (Sections 11.1 / 11.2) line up without anyone re-keying it.
    if (approved) {
      const status = attendanceStatusForLeave(request.type);

      for (let date = request.fromDate; date <= request.toDate; date = addDays(date, 1)) {
        await prisma.attendance.upsert({
          where: { userId_date: { userId: request.userId, date } },
          create: {
            userId: request.userId,
            date,
            status,
            note: `${request.type} leave approved (${moneyNote})`,
            markedById: req.user.id,
            source: 'SYSTEM',
          },
          update: {
            status,
            note: `${request.type} leave approved (${moneyNote})`,
            markedById: req.user.id,
            source: 'SYSTEM',
          },
        });
      }
    }

    await logAudit(
      req.user,
      approved ? AUDIT.LEAVE_APPROVED : AUDIT.LEAVE_REJECTED,
      'LeaveRequest',
      request.id,
      `${approved ? 'Approved' : 'Rejected'} ${request.user.name}'s ${request.type} leave (${request.fromDate} → ${request.toDate})` +
        (approved ? `, ${moneyNote}` : '') +
        (note ? ` — ${note}` : ''),
      { decision, note, isPaid: approved ? paid : null }
    );

    res.json({ request: updated });
  })
);

export default router;
