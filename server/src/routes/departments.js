import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT, DEPT_STATUS, QUESTION_TYPES } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import {
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  can,
  visibleUsersFilter,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { listUser } from '../services/serialize.js';
import { workSeries, workTotals } from '../services/work.js';
import { lastNDays, monthRange, currentMonth, todayISO, yesterdayISO } from '../lib/dates.js';
import { graceMinutes, hhmm } from '../lib/validators.js';

const router = Router();
router.use(requireAuth);

const slug = (s) =>
  s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        jobRoles: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { questions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
        },
        _count: { select: { members: true } },
      },
    });
    res.json({ departments });
  })
);

/** Department drill-down: members, graphs, tasks, attendance (Section 6.3). */
router.get(
  '/:id/overview',
  requirePermission('departments.view'),
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || currentMonth());
    const { start, end } = monthRange(month);
    const today = todayISO();

    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        jobRoles: { include: { questions: true } },
        members: {
          where: { ...visibleUsersFilter(req.user), isActive: true },
          include: { jobRoles: { include: { jobRole: true } } },
        },
      },
    });
    if (!department) throw new HttpError(404, 'Department not found');

    const memberIds = department.members.map((m) => m.id);

    const [totals, series, attendanceToday, tasks, pending] = await Promise.all([
      workTotals({ userIds: memberIds, from: start, to: end }),
      workSeries({ userIds: memberIds, dates: lastNDays(30) }),
      prisma.attendance.findMany({ where: { userId: { in: memberIds }, date: today } }),
      prisma.task.findMany({
        where: { OR: [{ departmentId: department.id }, { assigneeId: { in: memberIds } }] },
        include: { responses: true, assignee: { select: { name: true, employeeId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.workSubmission.count({
        where: { userId: { in: memberIds }, status: 'PENDING' },
      }),
    ]);

    // Per-member totals for the department leaderboard.
    const perMember = await Promise.all(
      department.members.map(async (m) => {
        const t = await workTotals({ userIds: [m.id], from: start, to: end });
        return {
          ...listUser(m, { includePay: can(req.user, 'salary.view') }),
          total: t.totalUnits,
          defectRate: t.defectRate,
        };
      })
    );

    res.json({
      department,
      month,
      members: perMember.sort((a, b) => b.total - a.total),
      work: totals,
      series,
      attendanceToday,
      tasks,
      pendingApprovals: pending,
      target: department.target,
      progress: department.target > 0 ? Math.min(100, Math.round((totals.totalUnits / department.target) * 100)) : null,
    });
  })
);

router.post(
  '/',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        nameHi: z.string().nullish(),
        code: z.string().nullish(),
        status: z.enum([DEPT_STATUS.ACTIVE, DEPT_STATUS.COMING_SOON]).default(DEPT_STATUS.ACTIVE),
        icon: z.string().default('Building2'),
        color: z.string().default('indigo'),
        target: z.number().int().min(0).default(0),
        dailyTarget: z.number().int().min(0).default(0),
        shiftStart: hhmm,
        graceMinutes,
        halfDayAfter: hhmm,
      })
      .parse(req.body);

    const count = await prisma.department.count();
    const department = await prisma.department.create({
      data: { ...body, code: slug(body.code || body.name), sortOrder: count },
    });
    await logAudit(
      req.user,
      AUDIT.DEPARTMENT_CREATED,
      'Department',
      department.id,
      `Created department ${department.name}`
    );
    res.status(201).json({ department });
  })
);

router.patch(
  '/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        nameHi: z.string().nullish(),
        status: z.enum([DEPT_STATUS.ACTIVE, DEPT_STATUS.COMING_SOON]).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        target: z.number().int().min(0).optional(),
        targetPeriod: z.enum(['WEEK', 'MONTH']).optional(),
        dailyTarget: z.number().int().min(0).optional(),
        sortOrder: z.number().int().optional(),
        // Shift timing for this department. Null clears it and the department
        // goes back to the office-wide policy.
        shiftStart: hhmm,
        graceMinutes,
        halfDayAfter: hhmm,
      })
      .parse(req.body);

    const department = await prisma.department.update({ where: { id: req.params.id }, data: body });
    await logAudit(
      req.user,
      body.target !== undefined ? AUDIT.TARGET_UPDATED : AUDIT.DEPARTMENT_UPDATED,
      'Department',
      department.id,
      `Updated ${department.name}`,
      body
    );
    res.json({ department });
  })
);

/** Section 10.3 — Autopilot. Super Admin only; affects future submissions. */
router.post(
  '/:id/autopilot',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { autopilot } = z.object({ autopilot: z.boolean() }).parse(req.body);
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: { autopilot },
    });
    await logAudit(
      req.user,
      AUDIT.AUTOPILOT_TOGGLED,
      'Department',
      department.id,
      `Autopilot turned ${autopilot ? 'ON' : 'OFF'} for ${department.name}`,
      { autopilot }
    );
    res.json({ department });
  })
);

// ───────────────────────────────────────────────────────────── Job roles (4)

router.post(
  '/:id/job-roles',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(2), nameHi: z.string().nullish() })
      .parse(req.body);
    const count = await prisma.jobRole.count({ where: { departmentId: req.params.id } });
    const jobRole = await prisma.jobRole.create({
      data: { ...body, departmentId: req.params.id, sortOrder: count },
      include: { questions: true },
    });
    await logAudit(
      req.user,
      AUDIT.JOB_ROLE_CREATED,
      'JobRole',
      jobRole.id,
      `Created job role ${jobRole.name}`
    );
    res.status(201).json({ jobRole });
  })
);

router.patch(
  '/job-roles/:roleId',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        nameHi: z.string().nullish(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const jobRole = await prisma.jobRole.update({ where: { id: req.params.roleId }, data: body });
    await logAudit(req.user, AUDIT.JOB_ROLE_UPDATED, 'JobRole', jobRole.id, `Updated job role ${jobRole.name}`, body);
    res.json({ jobRole });
  })
);

/** Replace a job role's whole question set in one call. */
router.put(
  '/job-roles/:roleId/questions',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { questions } = z
      .object({
        questions: z.array(
          z.object({
            id: z.string().optional(),
            key: z.string().min(1).optional(),
            label: z.string().min(1),
            labelHi: z.string().nullish(),
            type: z.enum([QUESTION_TYPES.NUMBER, QUESTION_TYPES.CHECK_FAIL]).default('NUMBER'),
            unit: z.string().nullish(),
          })
        ),
      })
      .parse(req.body);

    const keyOf = (q, i) =>
      q.key || `${q.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}_${i}`;

    // Keep history intact: questions no longer wanted are deactivated, not deleted.
    const existing = await prisma.question.findMany({ where: { jobRoleId: req.params.roleId } });
    const keptIds = new Set(questions.map((q) => q.id).filter(Boolean));

    await prisma.$transaction([
      ...existing
        .filter((q) => !keptIds.has(q.id))
        .map((q) => prisma.question.update({ where: { id: q.id }, data: { isActive: false } })),
      ...questions.map((q, i) =>
        q.id
          ? prisma.question.update({
              where: { id: q.id },
              data: { label: q.label, labelHi: q.labelHi ?? null, type: q.type, unit: q.unit ?? null, sortOrder: i, isActive: true },
            })
          : prisma.question.create({
              data: {
                jobRoleId: req.params.roleId,
                key: keyOf(q, i),
                label: q.label,
                labelHi: q.labelHi ?? null,
                type: q.type,
                unit: q.unit ?? null,
                sortOrder: i,
              },
            })
      ),
    ]);

    const jobRole = await prisma.jobRole.findUnique({
      where: { id: req.params.roleId },
      include: { questions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    await logAudit(
      req.user,
      AUDIT.QUESTION_UPDATED,
      'JobRole',
      jobRole.id,
      `Updated question set for ${jobRole.name} (${questions.length} questions)`
    );
    res.json({ jobRole });
  })
);

/** Yesterday's combined output per department — the dashboard blocks (6.2). */
router.get(
  '/summary/blocks',
  requirePermission('departments.view'),
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || yesterdayISO());
    const month = currentMonth();
    const { start, end } = monthRange(month);

    const departments = await prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { members: true } } },
    });

    const blocks = await Promise.all(
      departments.map(async (d) => {
        const [day, period] = await Promise.all([
          workTotals({ departmentId: d.id, from: date, to: date }),
          workTotals({ departmentId: d.id, from: start, to: end }),
        ]);
        return {
          id: d.id,
          name: d.name,
          nameHi: d.nameHi,
          code: d.code,
          status: d.status,
          color: d.color,
          icon: d.icon,
          autopilot: d.autopilot,
          members: d._count.members,
          yesterdayTotal: day.totalUnits,
          yesterdayRows: day.rows.slice(0, 6),
          monthTotal: period.totalUnits,
          defectRate: period.defectRate,
          target: d.target,
          pending: d.target > 0 ? Math.max(0, d.target - period.totalUnits) : null,
          progress: d.target > 0 ? Math.min(100, Math.round((period.totalUnits / d.target) * 100)) : null,
        };
      })
    );

    res.json({ date, month, blocks });
  })
);

export default router;
