import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT, ROLES } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import {
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  can,
  assertCanTouchPay,
  visibleUsersFilter,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { computeSalary, isMonthLocked } from '../services/salary.js';
import { currentMonth } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

/** "Salary so far this month" for the caller (Section 12.2). */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || currentMonth());
    res.json({ salary: await computeSalary(req.user.id, month) });
  })
);

router.get(
  '/user/:id',
  asyncHandler(async (req, res) => {
    const self = req.params.id === req.user.id;
    if (!self && !can(req.user, 'salary.view')) throw new HttpError(403, 'Not allowed');

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || (target.isHidden && !self)) throw new HttpError(404, 'Not found');

    const month = String(req.query.month || currentMonth());
    res.json({ salary: await computeSalary(req.params.id, month) });
  })
);

/** Payroll sheet for a month — everyone, one row each (Section 12.4). */
router.get(
  '/payroll',
  requirePermission('salary.view'),
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || currentMonth());
    const users = await prisma.user.findMany({
      where: { ...visibleUsersFilter(req.user), isActive: true },
      include: { department: { select: { name: true } } },
      orderBy: { employeeId: 'asc' },
    });

    const rows = await Promise.all(
      users.map(async (u) => ({
        ...(await computeSalary(u.id, month)),
        department: u.department?.name ?? '—',
        role: u.role,
      }))
    );

    const lock = await prisma.monthLock.findUnique({ where: { month } });
    const totals = rows.reduce(
      (acc, r) => ({
        base: acc.base + r.base,
        incentive: acc.incentive + r.incentive,
        bonus: acc.bonus + r.bonus,
        deduction: acc.deduction + r.deduction,
        net: acc.net + r.net,
      }),
      { base: 0, incentive: 0, bonus: 0, deduction: 0, net: 0 }
    );

    res.json({ month, rows, totals, lock });
  })
);

/** CSV export for whoever runs payroll (Section 12.4). */
router.get(
  '/payroll/export',
  requirePermission('salary.export'),
  asyncHandler(async (req, res) => {
    const month = String(req.query.month || currentMonth());
    const users = await prisma.user.findMany({
      where: { ...visibleUsersFilter(req.user), isActive: true },
      include: { department: { select: { name: true } } },
      orderBy: { employeeId: 'asc' },
    });

    const rows = await Promise.all(users.map((u) => computeSalary(u.id, month)));
    const header = [
      'Employee ID',
      'Name',
      'Department',
      'Salary Type',
      'Rate',
      'Paid Days',
      'Hours',
      'Base',
      'Incentive',
      'Bonus',
      'Deduction',
      'Net Payable',
    ];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      header.join(','),
      ...rows.map((r, i) =>
        [
          r.employeeId,
          r.name,
          users[i].department?.name ?? '',
          r.salaryType,
          r.salaryAmount,
          r.paidDays,
          r.hours,
          r.base,
          r.incentive,
          r.bonus,
          r.deduction,
          r.net,
        ]
          .map(escape)
          .join(',')
      ),
    ].join('\r\n');

    await logAudit(req.user, AUDIT.PAYROLL_EXPORTED, 'Payroll', month, `Exported payroll for ${month}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${month}.csv"`);
    res.send(`﻿${csv}`);
  })
);

/** Incentive / bonus / deduction — one person or everyone at once (5.3). */
router.post(
  '/pay-items',
  requirePermission('salary.edit'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.enum(['INCENTIVE', 'BONUS', 'DEDUCTION']),
        amount: z.number().positive('Enter an amount above 0'),
        month: z.string().regex(/^\d{4}-\d{2}$/).default(currentMonth()),
        note: z.string().nullish(),
        userId: z.string().nullish(),
        applyToAll: z.boolean().default(false),
        departmentId: z.string().nullish(),
      })
      .parse(req.body);

    if (await isMonthLocked(body.month)) {
      throw new HttpError(423, 'That month is locked — unlock it before making changes');
    }
    if (!body.applyToAll && !body.userId) throw new HttpError(400, 'Choose an employee');

    const targets = body.applyToAll
      ? await prisma.user.findMany({
          where: {
            ...visibleUsersFilter(req.user),
            isActive: true,
            role: { not: ROLES.SUPER_ADMIN },
            ...(body.departmentId ? { departmentId: body.departmentId } : {}),
          },
        })
      : [await prisma.user.findUnique({ where: { id: body.userId } })];

    if (!targets[0]) throw new HttpError(404, 'Employee not found');

    const batchId = body.applyToAll ? `batch_${Date.now()}` : null;
    const allowed = [];
    for (const t of targets) {
      try {
        assertCanTouchPay(req.user, t); // 7.2 — never yourself, never a Manager
        allowed.push(t);
      } catch (err) {
        if (!body.applyToAll) throw err; // single target: surface the reason
      }
    }

    await prisma.payItem.createMany({
      data: allowed.map((t) => ({
        userId: t.id,
        month: body.month,
        type: body.type,
        amount: body.amount,
        note: body.note ?? null,
        batchId,
        createdById: req.user.id,
      })),
    });

    await logAudit(
      req.user,
      AUDIT.PAY_ITEM_ADDED,
      'PayItem',
      batchId,
      `Added ${body.type.toLowerCase()} of ${body.amount} for ${
        body.applyToAll ? `${allowed.length} employees` : allowed[0].name
      } (${body.month})`,
      body
    );

    res.status(201).json({ created: allowed.length, skipped: targets.length - allowed.length });
  })
);

router.delete(
  '/pay-items/:id',
  requirePermission('salary.edit'),
  asyncHandler(async (req, res) => {
    const item = await prisma.payItem.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!item) throw new HttpError(404, 'Not found');
    if (await isMonthLocked(item.month)) throw new HttpError(423, 'That month is locked');
    assertCanTouchPay(req.user, item.user);

    await prisma.payItem.delete({ where: { id: item.id } });
    await logAudit(
      req.user,
      AUDIT.PAY_ITEM_REMOVED,
      'PayItem',
      item.id,
      `Removed ${item.type.toLowerCase()} of ${item.amount} from ${item.user.name} (${item.month})`
    );
    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────────── Month lock (12.3)

router.get(
  '/locks',
  requirePermission('salary.view'),
  asyncHandler(async (_req, res) => {
    const locks = await prisma.monthLock.findMany({ orderBy: { month: 'desc' } });
    res.json({ locks });
  })
);

router.post(
  '/locks',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);
    const lock = await prisma.monthLock.upsert({
      where: { month },
      create: { month, lockedById: req.user.id, isLocked: true },
      update: { isLocked: true, lockedById: req.user.id, lockedAt: new Date(), unlockedAt: null, unlockedById: null },
    });
    await logAudit(req.user, AUDIT.MONTH_LOCKED, 'MonthLock', lock.id, `Locked ${month} — salary paid`);
    res.json({ lock });
  })
);

router.post(
  '/locks/:month/unlock',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3, 'Say why — it goes in the history') }).parse(req.body);
    const lock = await prisma.monthLock.update({
      where: { month: req.params.month },
      data: { isLocked: false, unlockedById: req.user.id, unlockedAt: new Date(), unlockReason: reason },
    });
    // Section 12.3 — the unlock is recorded with who did it and why.
    await logAudit(
      req.user,
      AUDIT.MONTH_UNLOCKED,
      'MonthLock',
      lock.id,
      `Unlocked ${req.params.month} — ${reason}`,
      { reason }
    );
    res.json({ lock });
  })
);

export default router;
