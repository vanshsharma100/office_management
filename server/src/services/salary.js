import prisma from '../lib/prisma.js';
import { daysInMonth, monthRange, todayISO, monthOf } from '../lib/dates.js';
import { PAID_ATTENDANCE, ATTENDANCE_STATUS } from '../lib/constants.js';
import { getPolicy, isWeeklyOff } from './attendanceDerive.js';

/**
 * Section 12 — one employee's pay for one month.
 *
 * The employee is shown the month as a whole: what they earn, what was added,
 * and exactly what was taken off and why. So this reports a full monthly
 * figure with an itemised deduction list rather than a running daily total.
 *
 *   MONTHLY: gross is the month's salary. Days lost to absence, half days and
 *   unpaid leave are deducted at the day rate. Holidays, universal off days
 *   and weekly offs are never deducted — the office being closed is not the
 *   employee's doing.
 *
 *   HOURLY: hours actually recorded × the rate. Attendance deductions do not
 *   apply, since unworked hours are simply unpaid.
 *
 * Days the sync agent has not accounted for are NA. They are reported as
 * pending and deduct nothing. This matters: if the office PC is off for three
 * days, nobody loses three days of pay over it. The figure firms up when the
 * agent comes back and those days sync.
 */
export async function computeSalary(userId, month) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const { start, end } = monthRange(month);
  const [attendance, payItems, holidays, leaves, syncDays, policy] = await Promise.all([
    prisma.attendance.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.payItem.findMany({ where: { userId, month } }),
    prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
    prisma.leaveRequest.findMany({
      where: { userId, status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } },
    }),
    prisma.attendanceSyncDay.findMany({ where: { date: { gte: start, lte: end } } }),
    getPolicy(),
  ]);

  const holidaySet = new Set(holidays.map((h) => h.date));
  const syncedSet = new Set(syncDays.map((s) => s.date));
  const byDate = new Map(attendance.map((a) => [a.date, a]));

  const total = daysInMonth(month);
  const today = todayISO();
  const perDay = user.salaryType === 'MONTHLY' ? user.salaryAmount / total : 0;

  let paidDays = 0;
  let hours = 0;
  let absentDays = 0;
  let halfDays = 0;
  let unpaidLeaveDays = 0;
  let naDays = 0;
  let futureDays = 0;
  const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0, HALF_DAY: 0, WFH: 0, HOLIDAY: 0, WEEKLY_OFF: 0 };

  for (let i = 1; i <= total; i += 1) {
    const date = `${month}-${String(i).padStart(2, '0')}`;

    if (date > today) {
      futureDays += 1;
      continue; // hasn't happened; costs and earns nothing yet
    }

    const record = byDate.get(date);
    const closed = holidaySet.has(date) || isWeeklyOff(date, policy);

    // Office shut: pays in full, whether or not anything was ever synced.
    if (!record && closed) {
      counts.HOLIDAY += 1;
      paidDays += 1;
      continue;
    }

    // No record and the day was never confirmed by the agent — unknown, not absent.
    if (!record) {
      if (!syncedSet.has(date)) naDays += 1;
      else absentDays += 1; // synced, agent saw no punch: a real absence
      continue;
    }

    if (counts[record.status] !== undefined) counts[record.status] += 1;
    hours += record.hours ?? 0;

    if (record.status === ATTENDANCE_STATUS.HALF_DAY) {
      halfDays += 1;
      paidDays += 0.5;
    } else if (record.status === ATTENDANCE_STATUS.ABSENT) {
      absentDays += 1;
    } else if (record.status === ATTENDANCE_STATUS.LEAVE) {
      // The approver decides whether a leave pays, not the leave type.
      if (isUnpaidLeave(date, leaves)) unpaidLeaveDays += 1;
      else paidDays += 1;
    } else if (PAID_ATTENDANCE.includes(record.status)) {
      paidDays += 1;
    }
  }

  const monthly = user.salaryType === 'MONTHLY';
  const gross = monthly ? round2(user.salaryAmount) : round2(hours * user.salaryAmount);

  const deductions = {
    absent: monthly ? round2(absentDays * perDay) : 0,
    halfDay: monthly ? round2(halfDays * perDay * 0.5) : 0,
    unpaidLeave: monthly ? round2(unpaidLeaveDays * perDay) : 0,
    manual: sum(payItems, 'DEDUCTION'),
  };
  deductions.total = round2(
    deductions.absent + deductions.halfDay + deductions.unpaidLeave + deductions.manual
  );

  const incentive = sum(payItems, 'INCENTIVE');
  const bonus = sum(payItems, 'BONUS');

  // `base` stays "what attendance earned", so existing payroll screens that
  // read base / deduction / net keep meaning what they always did.
  const base = monthly
    ? round2(gross - deductions.absent - deductions.halfDay - deductions.unpaidLeave)
    : gross;
  const net = round2(base + incentive + bonus - deductions.manual);

  const lock = await prisma.monthLock.findUnique({ where: { month } });

  return {
    userId,
    employeeId: user.employeeId,
    name: user.name,
    month,
    salaryType: user.salaryType,
    salaryAmount: user.salaryAmount,
    daysInMonth: total,
    paidDays,
    hours: round2(hours),
    perDay: round2(perDay),
    gross,
    base,
    incentive,
    bonus,
    deduction: deductions.manual, // unchanged meaning for existing callers
    deductions, // itemised: absent / halfDay / unpaidLeave / manual / total
    net,
    counts,
    absentDays,
    halfDays,
    unpaidLeaveDays,
    // Days that have happened but the agent has not reported yet. Deducted
    // from nothing; shown so the number is never silently wrong.
    naDays,
    pendingAmount: round2(naDays * perDay),
    futureDays,
    items: payItems,
    locked: Boolean(lock?.isLocked),
  };
}

/** An approved leave covering this date that the approver marked unpaid. */
function isUnpaidLeave(date, leaves) {
  const cover = leaves.find((l) => l.fromDate <= date && l.toDate >= date);
  return cover ? cover.isPaid === false : false;
}

export async function isMonthLocked(month) {
  const lock = await prisma.monthLock.findUnique({ where: { month } });
  return Boolean(lock?.isLocked);
}

const sum = (items, type) =>
  round2(items.filter((i) => i.type === type).reduce((acc, i) => acc + i.amount, 0));

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
