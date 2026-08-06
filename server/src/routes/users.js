import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT, PERMISSION_KEYS, PERMISSIONS, ROLES, HARD_LIMITS } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import {
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  can,
  assertVisible,
  visibleUsersFilter,
  assertCanTouchPay,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { publicUser, listUser } from '../services/serialize.js';
import { computeSalary } from '../services/salary.js';
import { workSeries, workTotals } from '../services/work.js';
import { currentMonth, lastNDays, monthRange } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

/** Next permanent Employee ID — FT-0001, FT-0002 … (Section 1). */
async function nextEmployeeId() {
  const last = await prisma.user.findFirst({
    where: { employeeId: { startsWith: 'FT-' } },
    orderBy: { employeeId: 'desc' },
    select: { employeeId: true },
  });
  const n = last ? Number(last.employeeId.split('-')[1]) + 1 : 1;
  return `FT-${String(n).padStart(4, '0')}`;
}

router.get('/permission-catalog', (_req, res) =>
  res.json({ permissions: PERMISSIONS, hardLimits: HARD_LIMITS })
);

router.get(
  '/',
  requirePermission('employees.view'),
  asyncHandler(async (req, res) => {
    const { departmentId, role, status, q } = req.query;
    const users = await prisma.user.findMany({
      where: {
        ...visibleUsersFilter(req.user),
        ...(departmentId ? { departmentId } : {}),
        ...(role ? { role } : {}),
        ...(status === 'active' ? { isActive: true } : {}),
        ...(status === 'inactive' ? { isActive: false } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: String(q) } },
                { username: { contains: String(q) } },
                { employeeId: { contains: String(q) } },
              ],
            }
          : {}),
      },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
      orderBy: [{ isActive: 'desc' }, { employeeId: 'asc' }],
    });

    const includePay = can(req.user, 'salary.view');
    res.json({ users: users.map((u) => listUser(u, { includePay })) });
  })
);

router.post(
  '/',
  requirePermission('employees.create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        username: z.string().min(3).regex(/^[a-z0-9._-]+$/i, 'Letters, numbers, . _ - only'),
        password: z.string().min(6),
        role: z.enum([ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.SUPER_ADMIN]),
        departmentId: z.string().nullish(),
        jobRoleIds: z.array(z.string()).default([]),
        salaryType: z.enum(['MONTHLY', 'HOURLY']).default('MONTHLY'),
        salaryAmount: z.number().min(0).default(0),
        phone: z.string().nullish(),
        email: z.string().email().nullish().or(z.literal('')),
        isManager: z.boolean().default(false),
        permissions: z.array(z.enum(PERMISSION_KEYS)).default([]),
        employeeId: z.string().nullish(),
      })
      .parse(req.body);

    // Only the Super Admin creates other Super Admins or hands out permissions.
    if (body.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new HttpError(403, 'Only a Super Admin can create a Super Admin');
    }
    if (body.permissions.length && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new HttpError(403, 'Only a Super Admin can set Admin permissions');
    }

    const user = await prisma.user.create({
      data: {
        employeeId: body.employeeId?.trim() || (await nextEmployeeId()),
        username: body.username.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        name: body.name.trim(),
        role: body.role,
        departmentId: body.departmentId || null,
        salaryType: body.salaryType,
        salaryAmount: body.salaryAmount,
        phone: body.phone || null,
        email: body.email || null,
        isManager: body.isManager,
        permissions: JSON.stringify(body.role === ROLES.ADMIN ? body.permissions : []),
        jobRoles: { create: body.jobRoleIds.map((jobRoleId) => ({ jobRoleId })) },
      },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
    });

    await logAudit(
      req.user,
      AUDIT.ACCOUNT_CREATED,
      'User',
      user.id,
      `Created ${user.role.toLowerCase().replace('_', ' ')} account ${user.name} (${user.employeeId})`,
      { username: user.username, departmentId: user.departmentId }
    );

    res.status(201).json({ user: publicUser(user) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const self = req.params.id === req.user.id;
    if (!self && !can(req.user, 'employees.view')) {
      throw new HttpError(403, 'You can only open your own profile');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
    });
    assertVisible(req.user, user);

    const includePay = self || can(req.user, 'salary.view');
    res.json({ user: listUser(user, { includePay }) });
  })
);

/** Everything the drill-down needs for one employee (Section 6.3). */
router.get(
  '/:id/overview',
  asyncHandler(async (req, res) => {
    const self = req.params.id === req.user.id;
    if (!self && !can(req.user, 'employees.view')) throw new HttpError(403, 'Not allowed');

    const month = String(req.query.month || currentMonth());
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
    });
    assertVisible(req.user, user);

    const { start, end } = monthRange(month);
    const [attendance, submissions, leaves, tasks, queries, salary, totals, series] =
      await Promise.all([
        prisma.attendance.findMany({
          where: { userId: user.id, date: { gte: start, lte: end } },
          orderBy: { date: 'asc' },
        }),
        prisma.workSubmission.findMany({
          where: { userId: user.id, date: { gte: start, lte: end } },
          include: {
            entries: { include: { question: true } },
            reviewedBy: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
        }),
        prisma.leaveRequest.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { reviewedBy: { select: { name: true } } },
        }),
        prisma.taskResponse.findMany({
          where: { userId: user.id },
          include: { task: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.query.findMany({
          where: { userId: user.id },
          include: { replies: { include: { user: { select: { name: true, role: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        can(req.user, 'salary.view') || self ? computeSalary(user.id, month) : null,
        workTotals({ userIds: [user.id], from: start, to: end }),
        workSeries({ userIds: [user.id], dates: lastNDays(14) }),
      ]);

    res.json({
      user: listUser(user, { includePay: self || can(req.user, 'salary.view') }),
      month,
      attendance,
      submissions,
      leaves,
      tasks,
      queries,
      salary,
      work: totals,
      series,
    });
  })
);

router.patch(
  '/:id',
  requirePermission('employees.edit'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        departmentId: z.string().nullish(),
        jobRoleIds: z.array(z.string()).optional(),
        salaryType: z.enum(['MONTHLY', 'HOURLY']).optional(),
        salaryAmount: z.number().min(0).optional(),
        phone: z.string().nullish(),
        email: z.string().email().nullish().or(z.literal('')),
        isManager: z.boolean().optional(),
        isActive: z.boolean().optional(),
        role: z.enum([ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.SUPER_ADMIN]).optional(),
      })
      .parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    assertVisible(req.user, target);

    const touchesPay = body.salaryType !== undefined || body.salaryAmount !== undefined;
    if (touchesPay) {
      if (!can(req.user, 'salary.edit')) throw new HttpError(403, 'Not allowed to edit pay');
      assertCanTouchPay(req.user, target); // 7.2 hard limits
    }
    if (body.role && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new HttpError(403, 'Only a Super Admin can change a role');
    }
    if (body.isActive === false && !can(req.user, 'employees.deactivate')) {
      throw new HttpError(403, 'Not allowed to deactivate accounts');
    }

    const { jobRoleIds, ...rest } = body;
    const data = { ...rest };
    if (data.email === '') data.email = null;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(jobRoleIds
          ? {
              jobRoles: {
                deleteMany: {},
                create: jobRoleIds.map((jobRoleId) => ({ jobRoleId })),
              },
            }
          : {}),
      },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
    });

    const changed = Object.keys(body).join(', ');
    await logAudit(
      req.user,
      touchesPay ? AUDIT.SALARY_UPDATED : AUDIT.ACCOUNT_UPDATED,
      'User',
      user.id,
      `Updated ${user.name} (${changed})`,
      body
    );

    res.json({ user: publicUser(user) });
  })
);

router.post(
  '/:id/status',
  requirePermission('employees.deactivate'),
  asyncHandler(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    assertVisible(req.user, target);

    if (target.id === req.user.id) throw new HttpError(400, 'You cannot deactivate yourself');
    if (target.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new HttpError(403, 'Not allowed');
    }

    // Section 14.1 — deactivate, never delete. Records stay untouched.
    const user = await prisma.user.update({ where: { id: target.id }, data: { isActive } });
    await logAudit(
      req.user,
      isActive ? AUDIT.ACCOUNT_REACTIVATED : AUDIT.ACCOUNT_DEACTIVATED,
      'User',
      user.id,
      `${isActive ? 'Reactivated' : 'Deactivated'} ${user.name} (${user.employeeId})`
    );

    res.json({ user: publicUser(user) });
  })
);

router.post(
  '/:id/reset-password',
  requirePermission('employees.resetPassword'),
  asyncHandler(async (req, res) => {
    const { newPassword } = z.object({ newPassword: z.string().min(6) }).parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    assertVisible(req.user, target);
    if (target.role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new HttpError(403, 'Not allowed');
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: true },
    });
    await logAudit(
      req.user,
      AUDIT.PASSWORD_RESET,
      'User',
      target.id,
      `Reset password for ${target.name} (${target.employeeId})`
    );

    res.json({ ok: true });
  })
);

/** Section 7.1 — per-admin permission switches. Super Admin only. */
router.put(
  '/:id/permissions',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { permissions } = z
      .object({ permissions: z.array(z.enum(PERMISSION_KEYS)) })
      .parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'Account not found');
    if (target.role !== ROLES.ADMIN) {
      throw new HttpError(400, 'Permissions only apply to Admin accounts');
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: { permissions: JSON.stringify(permissions) },
    });
    await logAudit(
      req.user,
      AUDIT.PERMISSIONS_CHANGED,
      'User',
      user.id,
      `Set ${permissions.length} permission(s) for ${user.name}`,
      { permissions }
    );

    res.json({ user: publicUser(user) });
  })
);

export default router;
