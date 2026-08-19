import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import {
  AUDIT,
  ATTENDANCE_EXEMPT_ROLES,
  ATTENDANCE_STATUS,
  NON_WORKING_STATUS,
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
import { todayISO, monthRange, currentMonth, monthOf, addDays } from '../lib/dates.js';
import { isMonthLocked } from '../services/salary.js';
import { getPolicy, deriveDate } from '../services/attendanceDerive.js';
import { graceMinutes, hhmm } from '../lib/validators.js';

const router = Router();
router.use(requireAuth);

const STATUSES = Object.values(ATTENDANCE_STATUS);

/**
 * What an admin's verdict does to the punch-derived fields.
 *
 * Marking a day absent or on leave has to wipe the times the machine recorded,
 * because everything downstream still reads them: hourly pay is `hours × rate`
 * whatever the status says, and a leftover `lateMinutes` charges a late fine
 * for arriving late to a day the same admin just marked as time off. Statuses
 * where the person did work keep their times — correcting PRESENT to HALF_DAY
 * should not throw away when they arrived.
 */
const clearedPunchFields = (status) =>
  NON_WORKING_STATUS.includes(status)
    ? { checkIn: null, checkOut: null, hours: 0, lateMinutes: null, missingPunchOut: false }
    : {};

/**
 * Section 18 Q1 was left open, so both paths are supported:
 *  • the employee checks in / out themselves, and
 *  • an Admin marks or corrects attendance for anyone.
 * Every record carries who set it (source + markedById).
 */

router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const date = todayISO();
    const [record, holiday] = await Promise.all([
      prisma.attendance.findUnique({ where: { userId_date: { userId: req.user.id, date } } }),
      prisma.holiday.findUnique({ where: { date } }),
    ]);
    res.json({ date, record, holiday });
  })
);

router.post(
  '/check-in',
  asyncHandler(async (req, res) => {
    const date = todayISO();
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user.id, date } },
    });
    if (existing?.checkIn) throw new HttpError(400, 'You have already checked in today');

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId: req.user.id, date } },
      create: {
        userId: req.user.id,
        date,
        status: ATTENDANCE_STATUS.PRESENT,
        checkIn: new Date(),
        source: 'SELF',
      },
      update: { status: existing?.status ?? ATTENDANCE_STATUS.PRESENT, checkIn: new Date() },
    });
    await logAudit(req.user, AUDIT.ATTENDANCE_MARKED, 'Attendance', record.id, `Checked in for ${date}`);
    res.json({ record });
  })
);

router.post(
  '/check-out',
  asyncHandler(async (req, res) => {
    const date = todayISO();
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user.id, date } },
    });
    if (!existing?.checkIn) throw new HttpError(400, 'Check in first');
    if (existing.checkOut) throw new HttpError(400, 'You have already checked out today');

    const checkOut = new Date();
    const hours = Math.round(((checkOut - existing.checkIn) / 3_600_000) * 100) / 100;
    const record = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut, hours },
    });
    await logAudit(
      req.user,
      AUDIT.ATTENDANCE_MARKED,
      'Attendance',
      record.id,
      `Checked out for ${date} (${hours} h)`
    );
    res.json({ record });
  })
);

/** Daily attendance board — who is present, absent, on leave (6.1). */
router.get(
  '/day',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || todayISO());
    const [users, records, holiday] = await Promise.all([
      prisma.user.findMany({
        where: {
          ...visibleUsersFilter(req.user),
          isActive: true,
          // Whoever is not judged must not be listed as unmarked either.
          role: { notIn: ATTENDANCE_EXEMPT_ROLES },
        },
        include: { department: true },
        orderBy: { name: 'asc' },
      }),
      prisma.attendance.findMany({
        where: { date },
        include: { markedBy: { select: { name: true } } },
      }),
      prisma.holiday.findUnique({ where: { date } }),
    ]);

    const byUser = new Map(records.map((r) => [r.userId, r]));
    const rows = users.map((u) => ({
      userId: u.id,
      name: u.name,
      employeeId: u.employeeId,
      role: u.role,
      department: u.department?.name ?? '—',
      departmentId: u.departmentId,
      record: byUser.get(u.id) ?? null,
      status: byUser.get(u.id)?.status ?? (holiday ? 'HOLIDAY' : 'NOT_MARKED'),
    }));

    const summary = rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    res.json({ date, holiday, rows, summary });
  })
);

/** Month grid for one employee (own history is always allowed — 8.2). */
router.get(
  '/month',
  asyncHandler(async (req, res) => {
    const userId = String(req.query.userId || req.user.id);
    if (userId !== req.user.id && !can(req.user, 'attendance.view')) {
      throw new HttpError(403, 'Not allowed');
    }
    const month = String(req.query.month || currentMonth());
    const { start, end } = monthRange(month);

    const [records, holidays] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId, date: { gte: start, lte: end } },
        include: { markedBy: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
      prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    ]);

    const summary = records.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    res.json({ month, records, holidays, summary });
  })
);

/** Admin marks or corrects attendance (5.4). */
router.post(
  '/mark',
  requirePermission('attendance.edit'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        userId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(STATUSES),
        hours: z.number().min(0).max(24).optional(),
        note: z.string().nullish(),
      })
      .parse(req.body);

    // Section 7.2 — an Admin can never edit their own attendance.
    assertNotSelfAction(req.user, body.userId, 'attendance');

    if (await isMonthLocked(monthOf(body.date))) {
      throw new HttpError(423, 'That month is locked — unlock it before making changes');
    }

    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target || (target.isHidden && !req.user.isHidden)) throw new HttpError(404, 'Employee not found');

    const previous = await prisma.attendance.findUnique({
      where: { userId_date: { userId: body.userId, date: body.date } },
    });

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId: body.userId, date: body.date } },
      create: {
        userId: body.userId,
        date: body.date,
        status: body.status,
        hours: body.hours ?? 0,
        note: body.note ?? null,
        markedById: req.user.id,
        source: 'ADMIN',
        lockedByAdmin: true,
      },
      update: {
        status: body.status,
        ...clearedPunchFields(body.status),
        ...(body.hours !== undefined ? { hours: body.hours } : {}),
        note: body.note ?? null,
        markedById: req.user.id,
        source: 'ADMIN',
        // A human has ruled on this day. The sync agent must never overturn it,
        // or a correction made at 3pm is quietly undone by the 3:15 batch.
        lockedByAdmin: true,
      },
    });

    await logAudit(
      req.user,
      previous ? AUDIT.ATTENDANCE_CORRECTED : AUDIT.ATTENDANCE_MARKED,
      'Attendance',
      record.id,
      `${previous ? 'Corrected' : 'Marked'} ${target.name} as ${body.status} on ${body.date}` +
        (previous ? ` (was ${previous.status})` : ''),
      { from: previous?.status, to: body.status }
    );

    res.json({ record });
  })
);

/** Mark a whole list in one go — the daily board's "mark all present". */
router.post(
  '/bulk-mark',
  requirePermission('attendance.edit'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(STATUSES),
        userIds: z.array(z.string()).min(1),
      })
      .parse(req.body);

    if (await isMonthLocked(monthOf(body.date))) {
      throw new HttpError(423, 'That month is locked');
    }

    // Resolve the ids against real, visible accounts first. `/mark` does this
    // one at a time; without it here an unknown id fails the whole batch on a
    // foreign key, and the hidden backup account could be marked by anyone who
    // guessed its id (14.2).
    const requested = body.userIds.filter(
      (id) => id !== req.user.id || req.user.role === 'SUPER_ADMIN'
    );
    const targets = await prisma.user.findMany({
      where: { id: { in: requested }, ...visibleUsersFilter(req.user) },
      select: { id: true },
    });
    const ids = targets.map((t) => t.id);

    for (const userId of ids) {
      await prisma.attendance.upsert({
        where: { userId_date: { userId, date: body.date } },
        create: {
          userId,
          date: body.date,
          status: body.status,
          markedById: req.user.id,
          source: 'ADMIN',
          // Same rule as a single mark: a human has ruled on this day, so the
          // sync agent may never overturn it. Without this a bulk "mark all
          // present" is silently undone the next time that date is rebuilt.
          lockedByAdmin: true,
        },
        update: {
          status: body.status,
          ...clearedPunchFields(body.status),
          markedById: req.user.id,
          source: 'ADMIN',
          lockedByAdmin: true,
        },
      });
    }

    await logAudit(
      req.user,
      AUDIT.ATTENDANCE_MARKED,
      'Attendance',
      null,
      `Marked ${ids.length} employee(s) as ${body.status} on ${body.date}`
    );
    res.json({ updated: ids.length });
  })
);

// ───────────────────────────────────────────────────────── Holidays (5.4)

router.get(
  '/holidays',
  asyncHandler(async (req, res) => {
    const year = String(req.query.year || new Date().getFullYear());
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
      orderBy: { date: 'asc' },
    });
    res.json({ holidays });
  })
);

router.post(
  '/holidays',
  requirePermission('holidays.manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(2),
        nameHi: z.string().nullish(),
        note: z.string().nullish(),
        // UNIVERSAL_OFF closes the office for everyone; both pay in full.
        type: z.enum(['HOLIDAY', 'UNIVERSAL_OFF']).default('HOLIDAY'),
      })
      .parse(req.body);

    const holiday = await prisma.holiday.upsert({
      where: { date: body.date },
      create: body,
      update: body,
    });
    // A declared holiday must never reduce anyone's monthly salary (5.4) —
    // computeSalary() treats HOLIDAY as a fully paid day.
    await logAudit(
      req.user,
      AUDIT.HOLIDAY_DECLARED,
      'Holiday',
      holiday.id,
      `Declared holiday "${holiday.name}" on ${holiday.date}`
    );
    res.status(201).json({ holiday });
  })
);

router.delete(
  '/holidays/:id',
  requirePermission('holidays.manage'),
  asyncHandler(async (req, res) => {
    const holiday = await prisma.holiday.delete({ where: { id: req.params.id } });
    await logAudit(
      req.user,
      AUDIT.HOLIDAY_REMOVED,
      'Holiday',
      holiday.id,
      `Removed holiday "${holiday.name}" on ${holiday.date}`
    );
    res.json({ ok: true });
  })
);

// ──────────────────────────────────────── Shift & attendance rules (policy)
//
// Every field is optional and starts blank. A rule that is not filled in
// simply does not apply, so the office can configure this a piece at a time.

router.get(
  '/policy',
  asyncHandler(async (_req, res) => {
    res.json({ policy: await getPolicy() });
  })
);

router.put(
  '/policy',
  requirePermission('attendance.edit'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        shiftStart: hhmm,
        shiftEnd: hhmm,
        graceMinutes,
        halfDayAfter: hhmm,
        minHoursFullDay: z.number().min(0).max(24).nullish(),
        minHoursHalfDay: z.number().min(0).max(24).nullish(),
        weeklyOffDays: z.array(z.number().int().min(0).max(6)).default([]),
        nightShift: z.boolean().default(false),
        dayCloseTime: hhmm,
        requestWindowDays: z.number().int().min(0).max(90).nullish(),
        timezone: z.string().min(3).max(64).default('Asia/Kolkata'),
        freeLatesPerMonth: z.number().int().min(0).max(31).nullish(),
        lateFineAmount: z.number().min(0).max(100000).nullish(),
        halfDayFineAmount: z.number().min(0).max(100000).nullish(),
      })
      .parse(req.body);

    const data = { ...body, weeklyOffDays: JSON.stringify(body.weeklyOffDays) };
    const policy = await prisma.attendancePolicy.upsert({
      where: { id: 'policy' },
      create: { id: 'policy', ...data },
      update: data,
    });

    await logAudit(
      req.user,
      AUDIT.ATTENDANCE_POLICY_UPDATED,
      'AttendancePolicy',
      'policy',
      'Updated the shift and attendance rules'
    );
    // Existing days keep their old verdict until an admin recalculates, so a
    // rule change never silently rewrites a month that has already been paid.
    res.json({ policy });
  })
);

// ─────────────────────────────── "I was here, the machine missed me" requests

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const mine = !can(req.user, 'attendance.edit');
    const requests = await prisma.attendanceRequest.findMany({
      where: {
        ...(mine ? { userId: req.user.id } : {}),
        ...(req.query.status ? { status: String(req.query.status) } : {}),
      },
      include: { user: { select: { id: true, name: true, employeeId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ requests });
  })
);

router.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        claimedIn: hhmm,
        claimedOut: hhmm,
        reason: z.string().min(3).max(500),
      })
      .parse(req.body);

    if (body.date > todayISO()) throw new HttpError(400, 'That date has not happened yet');

    // The window stops anyone back-filling a month after salary has gone out.
    const policy = await getPolicy();
    if (policy.requestWindowDays != null) {
      const oldest = addDays(todayISO(), -policy.requestWindowDays);
      if (body.date < oldest) {
        throw new HttpError(
          400,
          `Presence can only be requested for the last ${policy.requestWindowDays} days`
        );
      }
    }
    if (await isMonthLocked(monthOf(body.date))) {
      throw new HttpError(409, 'That month is locked. Ask a Super Admin to unlock it first.');
    }

    const request = await prisma.attendanceRequest.upsert({
      where: { userId_date: { userId: req.user.id, date: body.date } },
      create: { ...body, userId: req.user.id },
      update: { ...body, status: 'PENDING', reviewedById: null, reviewedAt: null },
    });
    await logAudit(
      req.user,
      AUDIT.PRESENCE_REQUESTED,
      'AttendanceRequest',
      request.id,
      `Requested presence for ${body.date}`
    );
    res.status(201).json({ request });
  })
);

router.post(
  '/requests/:id/review',
  requirePermission('attendance.edit'),
  asyncHandler(async (req, res) => {
    const { approve, note } = z
      .object({ approve: z.boolean(), note: z.string().max(500).nullish() })
      .parse(req.body);

    const existing = await prisma.attendanceRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Request not found');
    assertNotSelfAction(req.user, existing.userId, 'presence');

    const request = await prisma.attendanceRequest.update({
      where: { id: req.params.id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    // Rebuild that day so the approval lands in attendance immediately.
    if (approve) await deriveDate(request.date);

    await logAudit(
      req.user,
      approve ? AUDIT.PRESENCE_APPROVED : AUDIT.PRESENCE_REJECTED,
      'AttendanceRequest',
      request.id,
      `${approve ? 'Approved' : 'Rejected'} presence for ${request.date}`
    );
    res.json({ request });
  })
);

export default router;
