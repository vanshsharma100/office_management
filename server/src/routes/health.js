import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, can, assertVisible, visibleUsersFilter } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { currentMonth } from '../lib/dates.js';
import { computeAutoHealth, resolveHealth, HEALTH_METRICS, AUTO_KEYS } from '../services/health.js';

/**
 * Section 13.7 — employee health.
 *
 * An admin fills the judgement metrics; the app fills the rest. Everyone can
 * see the leaderboard's totals, but a breakdown is private: your own, or
 * anyone's if you may view work.
 */
const router = Router();
router.use(requireAuth);

const monthOf = (q) => (/^\d{4}-\d{2}$/.test(String(q || '')) ? String(q) : currentMonth());

/** The metric list, so the form can render itself from one source of truth. */
router.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.json({ metrics: HEALTH_METRICS });
  })
);

/** One person's full scorecard for a month. Own, or anyone with work.view. */
router.get(
  '/user/:userId',
  asyncHandler(async (req, res) => {
    const own = req.params.userId === req.user.id;
    if (!own && !can(req.user, 'work.view')) throw new HttpError(403, 'Not allowed');

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    assertVisible(req.user, user);

    const month = monthOf(req.query.month);
    const [report, auto] = await Promise.all([
      prisma.healthReport.findUnique({ where: { userId_month: { userId: user.id, month } } }),
      computeAutoHealth(user.id, month),
    ]);

    res.json({
      month,
      user: { id: user.id, name: user.name, employeeId: user.employeeId },
      ...resolveHealth(report, auto),
      canEdit: can(req.user, 'health.manage'),
    });
  })
);

const scoreField = z.number().min(0).max(10).nullish();

/** Fill or update a scorecard. Admins only. */
router.put(
  '/user/:userId',
  requirePermission('health.manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        scores: z.object(Object.fromEntries(HEALTH_METRICS.map((m) => [m.key, scoreField]))).partial(),
        naKeys: z.array(z.string()).default([]),
        note: z.string().max(2000).nullish(),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    assertVisible(req.user, user);
    if (!user) throw new HttpError(404, 'Employee not found');

    // Only real metric keys survive, so a bad key cannot wander into naKeys.
    const validKeys = new Set(HEALTH_METRICS.map((m) => m.key));
    const naKeys = body.naKeys.filter((k) => validKeys.has(k));

    // A metric that is N/A stores no number — the two states must not disagree.
    const data = { month: body.month, naKeys: JSON.stringify(naKeys), note: body.note ?? null, updatedById: req.user.id };
    for (const m of HEALTH_METRICS) {
      data[m.key] = naKeys.includes(m.key) ? null : body.scores[m.key] ?? null;
    }

    const report = await prisma.healthReport.upsert({
      where: { userId_month: { userId: user.id, month: body.month } },
      create: { userId: user.id, ...data },
      update: data,
    });

    await logAudit(
      req.user,
      AUDIT.HEALTH_UPDATED,
      'HealthReport',
      report.id,
      `Updated ${user.name}'s health scorecard for ${body.month}`
    );

    const auto = await computeAutoHealth(user.id, body.month);
    res.json({ month: body.month, ...resolveHealth(report, auto) });
  })
);

/**
 * The leaderboard. Everybody sees names, totals and rank; only a work.view
 * holder gets each person's full breakdown alongside it.
 */
router.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const month = monthOf(req.query.month);
    const detailed = can(req.user, 'work.view');

    const users = await prisma.user.findMany({
      where: { ...visibleUsersFilter(req.user), isActive: true, role: 'EMPLOYEE' },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    });

    const reports = await prisma.healthReport.findMany({ where: { month } });
    const byUser = new Map(reports.map((r) => [r.userId, r]));

    const rows = await Promise.all(
      users.map(async (u) => {
        const auto = await computeAutoHealth(u.id, month);
        const resolved = resolveHealth(byUser.get(u.id), auto);
        return {
          userId: u.id,
          name: u.name,
          employeeId: u.employeeId,
          department: u.department?.name ?? null,
          total: resolved.total,
          scoredCount: resolved.scoredCount,
          isMe: u.id === req.user.id,
          metrics: detailed ? resolved.metrics : undefined,
        };
      })
    );

    // Unscored cards sink to the bottom rather than pretending to be zero.
    rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    let rank = 0;
    let lastTotal = null;
    rows.forEach((row, i) => {
      if (row.total == null) {
        row.rank = null;
      } else {
        if (row.total !== lastTotal) rank = i + 1;
        row.rank = rank;
        lastTotal = row.total;
      }
    });

    res.json({ month, rows });
  })
);

/** Convenience for an employee: their own scorecard. */
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const month = monthOf(req.query.month);
    const [report, auto] = await Promise.all([
      prisma.healthReport.findUnique({ where: { userId_month: { userId: req.user.id, month } } }),
      computeAutoHealth(req.user.id, month),
    ]);
    res.json({ month, ...resolveHealth(report, auto) });
  })
);

export default router;
