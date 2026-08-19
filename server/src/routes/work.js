import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import {
  AUDIT,
  DEPT_STATUS,
  SUBMISSION_STATUS,
  WFH_CUTOFF_HOUR,
  ROLES,
} from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, can, assertNotSelfAction, visibleUsersFilter } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { questionsForUser, workTotals, workSeries } from '../services/work.js';
import { todayISO, monthRange, currentMonth, lastNDays, monthOf } from '../lib/dates.js';
import { isMonthLocked } from '../services/salary.js';

const router = Router();
router.use(requireAuth);

/** The employee's own form: only their role's questions (Section 4). */
router.get(
  '/form',
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || todayISO());
    const userId = String(req.query.userId || req.user.id);

    if (userId !== req.user.id && !can(req.user, 'work.backfill')) {
      throw new HttpError(403, 'Not allowed to submit for someone else');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user) throw new HttpError(404, 'Employee not found');

    // Section 3 — Coming Soon departments block only the work section.
    if (!user.department || user.department.status === DEPT_STATUS.COMING_SOON) {
      return res.json({
        comingSoon: true,
        message: 'This department module is not created yet.',
        department: user.department,
        groups: [],
        submission: null,
      });
    }

    const [groups, submission, attendance] = await Promise.all([
      questionsForUser(userId),
      prisma.workSubmission.findUnique({
        where: { userId_date: { userId, date } },
        include: {
          entries: true,
          reviewedBy: { select: { name: true } },
          submittedBy: { select: { name: true } },
        },
      }),
      prisma.attendance.findUnique({ where: { userId_date: { userId, date } } }),
    ]);

    const gate = submissionGate({ actor: req.user, targetId: userId, date, attendance });

    res.json({
      comingSoon: false,
      department: user.department,
      autopilot: user.department.autopilot,
      groups,
      submission,
      attendance,
      canSubmit: gate.ok,
      blockedReason: gate.reason,
      locked: submission?.status === SUBMISSION_STATUS.APPROVED,
    });
  })
);

/**
 * Section 11 — who may put work in for a given day.
 *  • absent  → nothing counts, no submission
 *  • WFH     → allowed until 22:00 that day
 *  • admins with work.backfill may always enter on someone's behalf (11.3)
 */
function submissionGate({ actor, targetId, date, attendance }) {
  const isBackfill = actor.id !== targetId;
  if (isBackfill) return { ok: true, backfill: true };

  const today = todayISO();
  if (date > today) return { ok: false, reason: 'You cannot submit work for a future date' };
  if (date < today) {
    return { ok: false, reason: 'This day is closed — ask an Admin to enter it for you' };
  }
  if (attendance?.status === 'ABSENT') {
    return { ok: false, reason: 'You are marked absent today, so work cannot be submitted' };
  }
  if (attendance?.status === 'WFH' && new Date().getHours() >= WFH_CUTOFF_HOUR) {
    return { ok: false, reason: 'Work from home submissions close at 10:00 PM' };
  }
  return { ok: true };
}

const entrySchema = z.object({
  questionId: z.string(),
  value: z.number().int().min(0, 'Negative numbers are not allowed').default(0),
  failedValue: z.number().int().min(0, 'Negative numbers are not allowed').default(0),
});

/** Create or update a day's submission (9.4). Editable until approved. */
router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        userId: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayISO()),
        entries: z.array(entrySchema),
        note: z.string().nullish(),
      })
      .parse(req.body);

    const userId = body.userId || req.user.id;
    const isBackfill = userId !== req.user.id;
    if (isBackfill && !can(req.user, 'work.backfill')) {
      throw new HttpError(403, 'Not allowed to submit for someone else');
    }

    if (await isMonthLocked(monthOf(body.date))) {
      throw new HttpError(423, 'That month is locked — unlock it before making changes');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user) throw new HttpError(404, 'Employee not found');
    if (!user.department || user.department.status === DEPT_STATUS.COMING_SOON) {
      throw new HttpError(400, 'Department not created yet.');
    }

    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date: body.date } },
    });
    const gate = submissionGate({ actor: req.user, targetId: userId, date: body.date, attendance });
    if (!gate.ok) throw new HttpError(400, gate.reason);

    // Only accept questions that actually belong to this employee's roles.
    const groups = await questionsForUser(userId);
    const allowed = new Map(groups.flatMap((g) => g.questions).map((q) => [q.id, q]));
    const entries = body.entries.filter((e) => allowed.has(e.questionId));
    for (const e of entries) {
      const q = allowed.get(e.questionId);
      if (q.type === 'CHECK_FAIL' && e.failedValue > e.value) {
        throw new HttpError(400, `Failed count cannot be more than checked for "${q.label}"`);
      }
    }

    const existing = await prisma.workSubmission.findUnique({
      where: { userId_date: { userId, date: body.date } },
    });
    if (existing?.status === SUBMISSION_STATUS.APPROVED && !can(req.user, 'work.approve')) {
      throw new HttpError(423, 'This submission is approved and locked');
    }

    // Autopilot ON → counts immediately, no approval step (Section 10.3).
    // A per-person override wins over the department's setting.
    const autopilot = user.autopilot ?? user.department.autopilot;
    const status = autopilot ? SUBMISSION_STATUS.APPROVED : SUBMISSION_STATUS.PENDING;

    const submission = await prisma.workSubmission.upsert({
      where: { userId_date: { userId, date: body.date } },
      create: {
        userId,
        date: body.date,
        status,
        note: body.note ?? null,
        isBackfilled: isBackfill,
        submittedById: req.user.id,
        reviewedById: autopilot ? req.user.id : null,
        reviewedAt: autopilot ? new Date() : null,
        entries: {
          create: entries.map((e) => ({
            questionId: e.questionId,
            value: e.value,
            failedValue: e.failedValue,
          })),
        },
      },
      update: {
        status,
        note: body.note ?? null,
        rejectionReason: null,
        isBackfilled: isBackfill || existing?.isBackfilled || false,
        submittedById: req.user.id,
        submittedAt: new Date(),
        reviewedById: autopilot ? req.user.id : null,
        reviewedAt: autopilot ? new Date() : null,
        entries: {
          deleteMany: {},
          create: entries.map((e) => ({
            questionId: e.questionId,
            value: e.value,
            failedValue: e.failedValue,
          })),
        },
      },
      include: { entries: { include: { question: true } } },
    });

    const total = entries.reduce((acc, e) => acc + e.value, 0);
    await logAudit(
      req.user,
      isBackfill ? AUDIT.WORK_BACKFILLED : existing ? AUDIT.WORK_UPDATED : AUDIT.WORK_SUBMITTED,
      'WorkSubmission',
      submission.id,
      isBackfill
        ? `Entered work for ${user.name} on ${body.date} (${total} units) — admin backfill`
        : `${existing ? 'Updated' : 'Submitted'} work for ${body.date} (${total} units)`,
      { autopilot, total }
    );

    res.json({ submission, autopilot });
  })
);

/** Pending approvals queue (Section 6.1 / 10.1). */
router.get(
  '/pending',
  requirePermission('work.approve'),
  asyncHandler(async (req, res) => {
    const submissions = await prisma.workSubmission.findMany({
      where: {
        status: SUBMISSION_STATUS.PENDING,
        user: {
          ...visibleUsersFilter(req.user),
          ...(req.query.departmentId ? { departmentId: String(req.query.departmentId) } : {}),
        },
      },
      include: {
        entries: { include: { question: true } },
        user: { include: { department: true, jobRoles: { include: { jobRole: true } } } },
        submittedBy: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { submittedAt: 'asc' }],
      take: 200,
    });
    res.json({ submissions });
  })
);

router.post(
  '/:id/review',
  requirePermission('work.approve'),
  asyncHandler(async (req, res) => {
    const { decision, reason } = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT']),
        reason: z.string().nullish(),
      })
      .parse(req.body);

    const submission = await prisma.workSubmission.findUnique({
      where: { id: req.params.id },
      include: { user: true, entries: true },
    });
    if (!submission) throw new HttpError(404, 'Submission not found');

    // Section 7.2 — an Admin can never approve their own work.
    assertNotSelfAction(req.user, submission.userId, 'work');

    if (decision === 'REJECT' && !reason) {
      throw new HttpError(400, 'Give a reason so the employee knows what to correct');
    }

    const updated = await prisma.workSubmission.update({
      where: { id: submission.id },
      data: {
        status: decision === 'APPROVE' ? SUBMISSION_STATUS.APPROVED : SUBMISSION_STATUS.REJECTED,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        rejectionReason: decision === 'REJECT' ? reason : null,
      },
    });

    await logAudit(
      req.user,
      decision === 'APPROVE' ? AUDIT.WORK_APPROVED : AUDIT.WORK_REJECTED,
      'WorkSubmission',
      submission.id,
      `${decision === 'APPROVE' ? 'Approved' : 'Rejected'} ${submission.user.name}'s work for ${submission.date}` +
        (reason ? ` — ${reason}` : ''),
      { decision, reason }
    );

    res.json({ submission: updated });
  })
);

/** Bulk approve — the queue gets long otherwise. */
router.post(
  '/bulk-review',
  requirePermission('work.approve'),
  asyncHandler(async (req, res) => {
    const { ids, decision, reason } = z
      .object({
        ids: z.array(z.string()).min(1),
        decision: z.enum(['APPROVE', 'REJECT']),
        reason: z.string().nullish(),
      })
      .parse(req.body);

    const submissions = await prisma.workSubmission.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { name: true, id: true } } },
    });
    const allowed = submissions.filter((s) => {
      if (req.user.role === ROLES.SUPER_ADMIN) return true;
      return s.userId !== req.user.id; // never your own (7.2)
    });

    await prisma.workSubmission.updateMany({
      where: { id: { in: allowed.map((s) => s.id) } },
      data: {
        status: decision === 'APPROVE' ? SUBMISSION_STATUS.APPROVED : SUBMISSION_STATUS.REJECTED,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        rejectionReason: decision === 'REJECT' ? reason ?? 'Bulk rejected' : null,
      },
    });

    await logAudit(
      req.user,
      decision === 'APPROVE' ? AUDIT.WORK_APPROVED : AUDIT.WORK_REJECTED,
      'WorkSubmission',
      null,
      `${decision === 'APPROVE' ? 'Approved' : 'Rejected'} ${allowed.length} submission(s) in bulk`,
      { ids: allowed.map((s) => s.id) }
    );

    res.json({ updated: allowed.length, skipped: submissions.length - allowed.length });
  })
);

/** Own history (8.2) or, with permission, anyone's. */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const userId = String(req.query.userId || req.user.id);
    if (userId !== req.user.id && !can(req.user, 'work.view')) {
      throw new HttpError(403, 'Not allowed');
    }
    const month = String(req.query.month || currentMonth());
    const { start, end } = monthRange(month);

    const [submissions, totals, series] = await Promise.all([
      prisma.workSubmission.findMany({
        where: { userId, date: { gte: start, lte: end } },
        include: {
          entries: { include: { question: true } },
          reviewedBy: { select: { name: true } },
          submittedBy: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      workTotals({ userIds: [userId], from: start, to: end }),
      workSeries({ userIds: [userId], dates: lastNDays(30) }),
    ]);

    res.json({ month, submissions, totals, series });
  })
);

/** Company/department-wide report, any range (5.5). */
router.get(
  '/report',
  requirePermission('work.view'),
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || currentMonth());
    const { start, end } = monthRange(month);
    const from = String(req.query.from || start);
    const to = String(req.query.to || end);
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;

    const [totals, series, submissions] = await Promise.all([
      workTotals({ departmentId, from, to }),
      workSeries({ departmentId, dates: lastNDays(30, to) }),
      prisma.workSubmission.findMany({
        where: {
          date: { gte: from, lte: to },
          user: { ...visibleUsersFilter(req.user), ...(departmentId ? { departmentId } : {}) },
        },
        include: {
          user: { select: { id: true, name: true, employeeId: true, departmentId: true } },
          entries: true,
        },
        orderBy: { date: 'desc' },
        take: 500,
      }),
    ]);

    res.json({ from, to, totals, series, submissions });
  })
);

export default router;
