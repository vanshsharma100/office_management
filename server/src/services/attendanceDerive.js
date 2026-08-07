import prisma from '../lib/prisma.js';
import { todayISO } from '../lib/dates.js';
import { ATTENDANCE_STATUS } from '../lib/constants.js';

/**
 * Turns raw biometric punches into one attendance row per employee per day.
 *
 * Two rules govern everything here, and both exist to stop the system quietly
 * costing someone money:
 *
 *  1. A day is only judged once the agent has confirmed it synced that date.
 *     A date with no AttendanceSyncDay row is NA — unknown — never absent. If
 *     the office PC is off for three days, three days show as NA and salary
 *     treats them as pending, instead of marking the whole staff absent.
 *
 *  2. A row an admin has corrected (lockedByAdmin) is never touched again.
 *     Without this, a correction made at 3pm is undone by the 3:15 sync.
 *
 * Every policy field may be null — the office fills them in from Settings when
 * it is ready. Unset rules simply do not apply: with an empty policy a punch
 * means present and no punch on a synced day means absent, which is the
 * behaviour you would want before anyone has configured anything.
 */

const DEFAULT_POLICY = {
  id: 'policy',
  shiftStart: null,
  shiftEnd: null,
  graceMinutes: null,
  halfDayAfter: null,
  minHoursFullDay: null,
  minHoursHalfDay: null,
  weeklyOffDays: '[]',
  nightShift: false,
  dayCloseTime: null,
  requestWindowDays: null,
  timezone: 'Asia/Kolkata',
};

export async function getPolicy() {
  const row = await prisma.attendancePolicy.findUnique({ where: { id: 'policy' } });
  return row ?? DEFAULT_POLICY;
}

/** Department overrides win over the global policy, field by field. */
export function effectivePolicy(policy, department) {
  if (!department) return policy;
  return {
    ...policy,
    shiftStart: department.shiftStart ?? policy.shiftStart,
    graceMinutes: department.graceMinutes ?? policy.graceMinutes,
    halfDayAfter: department.halfDayAfter ?? policy.halfDayAfter,
  };
}

/** "09:30" → 570. Null-safe, so an unset policy field disables its rule. */
export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Minutes since midnight for an instant, read in the office's timezone. The
 * server may well be running in UTC on a rented machine; the shift is still
 * 9am in Ftech's office.
 */
export function minutesInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function weeklyOffSet(policy) {
  try {
    const parsed = JSON.parse(policy.weeklyOffDays || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(Number) : []);
  } catch {
    return new Set();
  }
}

export function isWeeklyOff(dateISO, policy) {
  return weeklyOffSet(policy).has(new Date(`${dateISO}T00:00:00`).getDay());
}

/**
 * Has this date finished, so that "no punch" can be read as absent?
 * Past dates always have. Today only once dayCloseTime has passed — otherwise
 * everyone who has not arrived yet shows absent all morning.
 */
export function isDayClosed(dateISO, policy, now = new Date()) {
  const today = todayISO(now);
  if (dateISO < today) return true;
  if (dateISO > today) return false;
  const close = toMinutes(policy.dayCloseTime);
  if (close === null) return false; // unset: today is never closed early
  return minutesInZone(now, policy.timezone) >= close;
}

/**
 * Decide one employee's status for one date from their punches that day.
 * Returns null when the day cannot be judged yet (no punches, day not closed).
 */
export function deriveStatus({ punches, policy, dateISO, now = new Date() }) {
  const tz = policy.timezone || 'Asia/Kolkata';

  if (punches.length === 0) {
    if (!isDayClosed(dateISO, policy, now)) return null; // still NA
    return {
      status: ATTENDANCE_STATUS.ABSENT,
      checkIn: null,
      checkOut: null,
      hours: 0,
      lateMinutes: null,
      missingPunchOut: false,
    };
  }

  const sorted = [...punches].sort((a, b) => a.punchAt - b.punchAt);
  const checkIn = sorted[0].punchAt;
  const last = sorted[sorted.length - 1].punchAt;

  // A single punch means they came in and never punched out. Do not penalise
  // it — people forget. Flag it and let an admin decide.
  const missingPunchOut = sorted.length === 1;
  const checkOut = missingPunchOut ? null : last;
  const hours = missingPunchOut ? 0 : round2((last - checkIn) / 3_600_000);

  const inMinutes = minutesInZone(checkIn, tz);
  const shiftStart = toMinutes(policy.shiftStart);
  const grace = policy.graceMinutes ?? 0;
  const lateMinutes =
    shiftStart === null ? null : Math.max(0, inMinutes - (shiftStart + grace));

  const halfDayAfter = toMinutes(policy.halfDayAfter);
  const arrivedTooLate = halfDayAfter !== null && inMinutes > halfDayAfter;

  // Hour rules only apply when we actually know the span — a missing punch-out
  // must not be read as "worked zero hours, mark absent".
  const shortForHalf =
    !missingPunchOut && policy.minHoursHalfDay != null && hours < policy.minHoursHalfDay;
  const shortForFull =
    !missingPunchOut && policy.minHoursFullDay != null && hours < policy.minHoursFullDay;

  let status = ATTENDANCE_STATUS.PRESENT;
  if (shortForHalf) status = ATTENDANCE_STATUS.ABSENT;
  else if (arrivedTooLate || shortForFull) status = ATTENDANCE_STATUS.HALF_DAY;

  return { status, checkIn, checkOut, hours, lateMinutes, missingPunchOut };
}

/**
 * Recompute every employee's attendance for one date and write it.
 * Safe to run repeatedly — that is the whole point, since the agent re-sends
 * days it could not deliver while the office PC was off.
 */
export async function deriveDate(dateISO, { now = new Date() } = {}) {
  const syncDay = await prisma.attendanceSyncDay.findUnique({ where: { date: dateISO } });
  if (!syncDay) return { date: dateISO, skipped: 'not-synced', written: 0 };

  const policy = await getPolicy();
  const [users, punches, holiday, leaves, requests, existing] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, isHidden: false },
      select: { id: true, departmentId: true },
    }),
    prisma.biometricPunch.findMany({ where: { date: dateISO, userId: { not: null } } }),
    prisma.holiday.findUnique({ where: { date: dateISO } }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', fromDate: { lte: dateISO }, toDate: { gte: dateISO } },
    }),
    prisma.attendanceRequest.findMany({ where: { date: dateISO, status: 'APPROVED' } }),
    prisma.attendance.findMany({ where: { date: dateISO } }),
  ]);

  const departments = await prisma.department.findMany({
    select: { id: true, shiftStart: true, graceMinutes: true, halfDayAfter: true },
  });
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const punchesByUser = groupBy(punches, (p) => p.userId);
  const leaveByUser = new Map(leaves.map((l) => [l.userId, l]));
  const requestByUser = new Map(requests.map((r) => [r.userId, r]));
  const lockedUsers = new Set(existing.filter((a) => a.lockedByAdmin).map((a) => a.userId));

  const offDay = Boolean(holiday) || isWeeklyOff(dateISO, policy);
  let written = 0;

  for (const user of users) {
    if (lockedUsers.has(user.id)) continue; // an admin decided this day already

    const result = resolveUserDay({
      user,
      dateISO,
      offDay,
      holiday,
      leave: leaveByUser.get(user.id),
      request: requestByUser.get(user.id),
      punches: punchesByUser.get(user.id) ?? [],
      policy: effectivePolicy(policy, deptById.get(user.departmentId)),
      now,
    });
    if (!result) continue; // still NA — write nothing, so the day stays unknown

    await prisma.attendance.upsert({
      where: { userId_date: { userId: user.id, date: dateISO } },
      create: { userId: user.id, date: dateISO, source: result.source, ...result.fields },
      update: { source: result.source, ...result.fields },
    });
    written += 1;
  }

  return { date: dateISO, written, punches: punches.length };
}

/** The precedence order for one person on one day. */
function resolveUserDay({ user, dateISO, offDay, holiday, leave, request, punches, policy, now }) {
  // Office closed for everyone — never reduces anyone's salary.
  if (offDay) {
    return {
      source: 'SYSTEM',
      fields: {
        status: holiday ? ATTENDANCE_STATUS.HOLIDAY : ATTENDANCE_STATUS.WEEKLY_OFF,
        checkIn: null,
        checkOut: null,
        hours: 0,
        lateMinutes: null,
        missingPunchOut: false,
        note: holiday?.name ?? null,
      },
    };
  }

  // An approved "I was here, the machine missed me" request beats missing punches.
  if (request) {
    return {
      source: 'REQUEST',
      fields: {
        status: ATTENDANCE_STATUS.PRESENT,
        checkIn: hhmmToDate(dateISO, request.claimedIn),
        checkOut: hhmmToDate(dateISO, request.claimedOut),
        hours: 0,
        lateMinutes: null,
        missingPunchOut: false,
        note: 'Approved presence request',
      },
    };
  }

  if (leave) {
    return {
      source: 'SYSTEM',
      fields: {
        status: ATTENDANCE_STATUS.LEAVE,
        checkIn: null,
        checkOut: null,
        hours: 0,
        lateMinutes: null,
        missingPunchOut: false,
        note: leave.isPaid === false ? 'Unpaid leave' : 'Approved leave',
      },
    };
  }

  const derived = deriveStatus({ punches, policy, dateISO, now });
  if (!derived) return null;
  return { source: 'SYSTEM', fields: { ...derived, note: null } };
}

function hhmmToDate(dateISO, hhmm) {
  if (!hhmm) return null;
  const d = new Date(`${dateISO}T${hhmm}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
