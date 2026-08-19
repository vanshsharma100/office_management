import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import {
  requireAuth,
  requireSuperAdmin,
  can,
  assertVisible,
  visibleUsersFilter,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { getWeeklyReportConfig, setSetting, SETTING } from '../lib/settings.js';
import {
  isWindowOpen,
  weekEndOf,
  weekStartOf,
  weekStartsSinceJoining,
  windowOpensOn,
  toISODate,
} from '../lib/week.js';
import { todayISO } from '../lib/dates.js';

/**
 * Section 13.6 — the weekly report.
 *
 * One per employee per week, filled in a window the office chooses. A week
 * whose window has closed with no row is "missing", which is reported rather
 * than enforced: it shows on the employee's own screen and on an Admin's view
 * of them, and blocks nothing.
 */
const router = Router();
router.use(requireAuth);

const ANSWERS = {
  tasksAssigned: z.string().trim().min(1, 'Say what you were given this week').max(4000),
  tasksCompleted: z.string().trim().min(1, 'Say what you finished').max(4000),
  pendingTasks: z.string().trim().max(4000).nullish(),
  keyAchievement: z.string().trim().max(4000).nullish(),
  challenges: z.string().trim().max(4000).nullish(),
  nextWeekPlan: z.string().trim().max(4000).nullish(),
  supportRequired: z.string().trim().max(4000).nullish(),
};

/**
 * The day this person's report opens. Their own setting wins over the
 * office's, so one employee can report on a different day without moving
 * everybody — same most-specific-wins rule as the shift timings.
 */
const dayFor = (user, config) => user?.weeklyReportDay ?? config.openDay;

/** Adds the state a screen needs: filled, open to fill, or missed. */
function decorate(weekStart, report, config, today = todayISO()) {
  const open = config.enabled && isWindowOpen(weekStart, config.openDay, today);
  const current = weekStart === weekStartOf(today);
  return {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    opensOn: windowOpensOn(weekStart, config.openDay),
    report: report ?? null,
    isOpen: open,
    // A week nobody could fill yet is not missing. Only a closed window with
    // no report is, which is why this cannot be read off the row alone.
    status: report ? 'SUBMITTED' : open ? 'DUE' : current ? 'NOT_YET_OPEN' : 'MISSING',
  };
}

/** The office's rules. Everyone may read them; only a Super Admin sets them. */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ config: await getWeeklyReportConfig() });
  })
);

router.put(
  '/config',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        enabled: z.boolean(),
        openDay: z.number().int().min(0).max(6),
      })
      .parse(req.body);

    await Promise.all([
      setSetting(SETTING.WEEKLY_REPORT_ENABLED, body.enabled),
      setSetting(SETTING.WEEKLY_REPORT_OPEN_DAY, body.openDay),
    ]);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    await logAudit(
      req.user,
      AUDIT.WEEKLY_REPORT_CONFIGURED,
      'Setting',
      SETTING.WEEKLY_REPORT_OPEN_DAY,
      body.enabled
        ? `Weekly report opens on ${days[body.openDay]} and stays open until the week ends`
        : 'Turned the weekly report off'
    );

    res.json({ config: await getWeeklyReportConfig() });
  })
);

/** My last few weeks, each marked submitted, due, or missing. */
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const weeks = Math.min(Number(req.query.weeks) || 8, 52);
    const office = await getWeeklyReportConfig();
    const config = { ...office, openDay: dayFor(req.user, office) };
    const starts = weekStartsSinceJoining(weeks, req.user.joinDate);

    const reports = await prisma.weeklyReport.findMany({
      where: { userId: req.user.id, weekStart: { in: starts } },
    });
    const byWeek = new Map(reports.map((r) => [r.weekStart, r]));

    res.json({ config, weeks: starts.map((w) => decorate(w, byWeek.get(w), config)) });
  })
);

/** One employee's weeks, for an Admin looking at their page. */
router.get(
  '/user/:userId',
  asyncHandler(async (req, res) => {
    const own = req.params.userId === req.user.id;
    if (!own && !can(req.user, 'work.view')) throw new HttpError(403, 'Not allowed');

    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    assertVisible(req.user, target);

    const weeks = Math.min(Number(req.query.weeks) || 8, 52);
    const office = await getWeeklyReportConfig();
    const config = { ...office, openDay: dayFor(target, office) };
    const starts = weekStartsSinceJoining(weeks, target.joinDate);
    const reports = await prisma.weeklyReport.findMany({
      where: { userId: target.id, weekStart: { in: starts } },
    });
    const byWeek = new Map(reports.map((r) => [r.weekStart, r]));

    res.json({ config, weeks: starts.map((w) => decorate(w, byWeek.get(w), config)) });
  })
);

/**
 * Who has not filled this week in. The point of the whole feature — an Admin
 * should not have to open twenty people to find the three who owe a report.
 */
router.get(
  '/missing',
  asyncHandler(async (req, res) => {
    if (!can(req.user, 'work.view')) throw new HttpError(403, 'Not allowed');

    const config = await getWeeklyReportConfig();
    const weekStart = String(req.query.weekStart || weekStartOf());
    const [users, reports] = await Promise.all([
      prisma.user.findMany({
        where: { ...visibleUsersFilter(req.user), isActive: true, role: 'EMPLOYEE' },
        select: {
          id: true,
          name: true,
          employeeId: true,
          weeklyReportDay: true,
          joinDate: true,
          department: { select: { name: true } },
        },
        orderBy: { employeeId: 'asc' },
      }),
      prisma.weeklyReport.findMany({ where: { weekStart }, select: { userId: true } }),
    ]);

    const done = new Set(reports.map((r) => r.userId));
    const office = decorate(weekStart, null, config);

    // Someone whose own report day has not arrived yet is not missing — they
    // are waiting, and lumping the two together would have an Admin chasing
    // people who have done nothing wrong.
    // Somebody who had not joined yet owed nothing for this week.
    const employed = users.filter((u) => weekStartOf(toISODate(u.joinDate)) <= weekStart);

    const withState = employed.map((u) => ({
      ...u,
      status: decorate(weekStart, done.has(u.id) ? {} : null, {
        ...config,
        openDay: dayFor(u, config),
      }).status,
    }));

    res.json({
      weekStart,
      weekEnd: office.weekEnd,
      opensOn: office.opensOn,
      isOpen: office.isOpen,
      submitted: withState.filter((u) => done.has(u.id)),
      missing: withState.filter((u) => !done.has(u.id) && u.status !== 'NOT_YET_OPEN'),
      notDueYet: withState.filter((u) => !done.has(u.id) && u.status === 'NOT_YET_OPEN'),
    });
  })
);

/**
 * Submit or correct this week's report.
 *
 * Only the current week, and only once its window has opened — an employee
 * cannot quietly write last month's report today, which would make the whole
 * record worthless.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z.object(ANSWERS).parse(req.body);

    const office = await getWeeklyReportConfig();
    if (!office.enabled) throw new HttpError(400, 'The weekly report is switched off');
    const config = { ...office, openDay: dayFor(req.user, office) };

    const weekStart = weekStartOf();
    if (!isWindowOpen(weekStart, config.openDay)) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      throw new HttpError(
        400,
        `This week's report opens on ${days[config.openDay]} (${windowOpensOn(weekStart, config.openDay)})`
      );
    }

    const clean = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? null : v])
    );

    const existing = await prisma.weeklyReport.findUnique({
      where: { userId_weekStart: { userId: req.user.id, weekStart } },
    });

    const report = await prisma.weeklyReport.upsert({
      where: { userId_weekStart: { userId: req.user.id, weekStart } },
      create: { userId: req.user.id, weekStart, ...clean },
      update: clean,
    });

    await logAudit(
      req.user,
      existing ? AUDIT.WEEKLY_REPORT_UPDATED : AUDIT.WEEKLY_REPORT_SUBMITTED,
      'WeeklyReport',
      report.id,
      `${existing ? 'Updated' : 'Submitted'} the weekly report for week of ${weekStart}`
    );

    res.status(existing ? 200 : 201).json({ report });
  })
);

export default router;
