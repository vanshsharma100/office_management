import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { ROLES, SUBMISSION_STATUS } from '../lib/constants.js';
import { requireAuth, can, visibleUsersFilter } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { workSeries, workTotals } from '../services/work.js';
import { computeSalary } from '../services/salary.js';
import { todayISO, yesterdayISO, currentMonth, monthRange, lastNDays } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

/** One call powers the landing screen for whichever panel the user has. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAdminish = req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.ADMIN;
    res.json(isAdminish ? await adminDashboard(req) : await employeeDashboard(req));
  })
);

/** Section 6 — nothing here is a dead statistic; every block drills down. */
async function adminDashboard(req) {
  const today = todayISO();
  const yesterday = yesterdayISO();
  const month = currentMonth();
  const { start, end } = monthRange(month);
  const hiddenFilter = visibleUsersFilter(req.user);

  const [
    headcount,
    activeCount,
    attendanceToday,
    holiday,
    pendingWork,
    pendingLeave,
    pendingTasks,
    openQueries,
    notices,
    departments,
    monthTotals,
    series,
  ] = await Promise.all([
    prisma.user.count({ where: hiddenFilter }),
    prisma.user.count({ where: { ...hiddenFilter, isActive: true } }),
    prisma.attendance.findMany({ where: { date: today, user: hiddenFilter } }),
    prisma.holiday.findUnique({ where: { date: today } }),
    prisma.workSubmission.count({ where: { status: SUBMISSION_STATUS.PENDING, user: hiddenFilter } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING', user: hiddenFilter } }),
    prisma.taskResponse.count({ where: { status: 'PENDING' } }),
    prisma.query.count({ where: { status: 'OPEN', user: hiddenFilter } }),
    prisma.notice.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      include: { createdBy: { select: { name: true } }, _count: { select: { reads: true } } },
    }),
    prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { members: true } } },
    }),
    workTotals({ from: start, to: end }),
    workSeries({ dates: lastNDays(14) }),
  ]);

  const attendanceSummary = attendanceToday.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  attendanceSummary.NOT_MARKED = Math.max(0, activeCount - attendanceToday.length);

  // Department blocks: yesterday's combined output + progress to target (6.2/6.4)
  const blocks = await Promise.all(
    departments.map(async (d) => {
      const [day, period] = await Promise.all([
        workTotals({ departmentId: d.id, from: yesterday, to: yesterday }),
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
        topRows: day.rows.slice(0, 4),
        monthTotal: period.totalUnits,
        defectRate: period.defectRate,
        target: d.target,
        pending: d.target > 0 ? Math.max(0, d.target - period.totalUnits) : null,
        progress: d.target > 0 ? Math.min(100, Math.round((period.totalUnits / d.target) * 100)) : null,
      };
    })
  );

  // Tasks assigned but not yet submitted (6.1)
  const openTasks = await prisma.task.findMany({
    where: { isOpen: true },
    include: { responses: true, assignee: { select: { name: true } }, department: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const approvals = can(req.user, 'work.approve')
    ? await prisma.workSubmission.findMany({
        where: { status: SUBMISSION_STATUS.PENDING, user: hiddenFilter },
        include: {
          user: { select: { name: true, employeeId: true, department: { select: { name: true } } } },
          entries: true,
        },
        orderBy: { submittedAt: 'asc' },
        take: 8,
      })
    : [];

  return {
    panel: 'ADMIN',
    today,
    yesterday,
    month,
    holiday,
    stats: {
      headcount,
      activeCount,
      pendingWork,
      pendingLeave,
      pendingTasks,
      openQueries,
      monthUnits: monthTotals.totalUnits,
      defectRate: monthTotals.defectRate,
    },
    attendanceSummary,
    blocks,
    notices,
    openTasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      assignee: t.assignee?.name ?? t.department?.name ?? 'Everyone',
      responded: t.responses.length,
      overdue: t.dueDate ? new Date(t.dueDate) < new Date() : false,
    })),
    approvals,
    series,
    topWork: monthTotals.rows.slice(0, 8),
  };
}

/** Section 8.1 — the employee's own screen, and only their own data. */
async function employeeDashboard(req) {
  const today = todayISO();
  const month = currentMonth();
  const { start, end } = monthRange(month);
  const userId = req.user.id;

  const [attendanceToday, monthAttendance, salary, totals, series, submission, tasks, notices, leaves, holiday] =
    await Promise.all([
      prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } }),
      prisma.attendance.findMany({ where: { userId, date: { gte: start, lte: end } } }),
      computeSalary(userId, month),
      workTotals({ userIds: [userId], from: start, to: end }),
      workSeries({ userIds: [userId], dates: lastNDays(14) }),
      prisma.workSubmission.findUnique({
        where: { userId_date: { userId, date: today } },
        include: { entries: { include: { question: true } } },
      }),
      prisma.task.findMany({
        where: {
          isOpen: true,
          OR: [
            { assigneeId: userId },
            { assigneeId: null, departmentId: req.user.departmentId ?? '__none__' },
          ],
        },
        include: { responses: { where: { userId } }, department: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.notice.findMany({
        where: {
          OR: [
            { audience: 'ALL' },
            { audience: 'DEPARTMENT', departmentId: req.user.departmentId ?? '__none__' },
            { audience: 'USER', targetUserId: userId },
          ],
        },
        include: { createdBy: { select: { name: true } }, reads: { where: { userId } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 6,
      }),
      prisma.leaveRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.holiday.findUnique({ where: { date: today } }),
    ]);

  const attendanceSummary = monthAttendance.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const pendingApprovals = await prisma.workSubmission.count({
    where: { userId, status: SUBMISSION_STATUS.PENDING },
  });

  return {
    panel: 'EMPLOYEE',
    today,
    month,
    holiday,
    department: req.user.department,
    comingSoon: !req.user.department || req.user.department.status === 'COMING_SOON',
    attendanceToday,
    attendanceSummary,
    salary,
    work: totals,
    series,
    todaySubmission: submission,
    pendingApprovals,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      priority: t.priority,
      department: t.department?.name,
      myResponse: t.responses[0] ?? null,
      overdue: t.dueDate ? new Date(t.dueDate) < new Date() : false,
    })),
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      pinned: n.pinned,
      createdAt: n.createdAt,
      author: n.createdBy.name,
      readByMe: n.reads.length > 0,
    })),
    leaves,
  };
}

export default router;
