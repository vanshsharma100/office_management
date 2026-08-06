import prisma from '../lib/prisma.js';
import { daysInMonth, monthRange, todayISO, monthOf } from '../lib/dates.js';
import { PAID_ATTENDANCE } from '../lib/constants.js';

/**
 * Section 12 — salary for one employee in one month.
 *
 * MONTHLY: the month's pay is divided across the calendar days, and every day
 * that counts as paid (present, approved WFH, declared holiday, paid leave)
 * earns a full share; half days earn half. A declared holiday therefore never
 * reduces anyone's salary (Section 5.4).
 *
 * HOURLY: hours actually recorded × the hourly rate.
 *
 * Incentives and bonuses add, deductions subtract (Section 12.1).
 * "Salary so far this month" (12.2) is the same calculation run against the
 * days that have happened so far.
 */
export async function computeSalary(userId, month) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const { start, end } = monthRange(month);
  const [attendance, payItems, holidays] = await Promise.all([
    prisma.attendance.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.payItem.findMany({ where: { userId, month } }),
    prisma.holiday.findMany({ where: { date: { gte: start, lte: end } } }),
  ]);

  const holidaySet = new Set(holidays.map((h) => h.date));
  const byDate = new Map(attendance.map((a) => [a.date, a]));

  const total = daysInMonth(month);
  const today = todayISO();
  const isCurrentMonth = monthOf(today) === month;

  let paidDays = 0;
  let hours = 0;
  const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0, HALF_DAY: 0, WFH: 0, HOLIDAY: 0 };

  for (let i = 1; i <= total; i += 1) {
    const date = `${month}-${String(i).padStart(2, '0')}`;
    if (isCurrentMonth && date > today) break; // don't pay for days that haven't happened

    const record = byDate.get(date);
    const status = record?.status ?? (holidaySet.has(date) ? 'HOLIDAY' : null);
    if (!status) continue;

    if (counts[status] !== undefined) counts[status] += 1;
    if (status === 'HALF_DAY') paidDays += 0.5;
    else if (PAID_ATTENDANCE.includes(status)) paidDays += 1;

    hours += record?.hours ?? 0;
  }

  const perDay = user.salaryType === 'MONTHLY' ? user.salaryAmount / total : 0;
  const base =
    user.salaryType === 'MONTHLY'
      ? round2(perDay * paidDays)
      : round2(hours * user.salaryAmount);

  const incentive = sum(payItems, 'INCENTIVE');
  const bonus = sum(payItems, 'BONUS');
  const deduction = sum(payItems, 'DEDUCTION');
  const net = round2(base + incentive + bonus - deduction);

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
    base,
    incentive,
    bonus,
    deduction,
    net,
    counts,
    items: payItems,
    locked: Boolean(lock?.isLocked),
  };
}

export async function isMonthLocked(month) {
  const lock = await prisma.monthLock.findUnique({ where: { month } });
  return Boolean(lock?.isLocked);
}

const sum = (items, type) =>
  round2(items.filter((i) => i.type === type).reduce((acc, i) => acc + i.amount, 0));

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
