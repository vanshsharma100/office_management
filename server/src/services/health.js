import prisma from '../lib/prisma.js';
import { computeSalary } from './salary.js';

/**
 * Section 13.7 — the employee health scorecard.
 *
 * Ten qualities, each out of 10, one card per employee per month. The total is
 * the average of the qualities that actually have a score, so someone with AI
 * Use marked N/A is not punished for it — their card is simply out of nine.
 *
 * Three qualities are computed from what the system already knows and the rest
 * are the admin's judgement. A computed one can still be overridden: the stored
 * value wins when it is set, and the live figure fills in when it is not, so a
 * month that syncs late corrects itself until someone pins a number down.
 */

// order is the order they appear everywhere. `auto` ones are computed.
export const HEALTH_METRICS = [
  { key: 'punctuality', label: 'Punctuality', auto: true, hint: 'From daily in / out times' },
  { key: 'attendance', label: 'Attendance', auto: true, hint: 'Present against working days' },
  { key: 'progress', label: 'Progress', hint: 'Work done against target' },
  { key: 'dedication', label: 'Dedication / Efficiency' },
  { key: 'learning', label: 'Learning' },
  { key: 'aiUse', label: 'AI Use', naHint: 'Set N/A for anyone who does not use AI' },
  { key: 'careless', label: 'Carefulness', hint: '10 = never careless' },
  { key: 'behaviour', label: 'Behaviour / Maturity' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'cleanliness', label: 'Cleanliness' },
];

export const AUTO_KEYS = HEALTH_METRICS.filter((m) => m.auto).map((m) => m.key);
const clamp10 = (n) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

/**
 * The two computed qualities for a month, each a /10 suggestion or null when
 * there is nothing to judge it on yet. The `detail` explains the number so an
 * admin can see why before deciding whether to override it.
 *
 * Progress is deliberately not here — it is the admin's own judgement, typed
 * by hand out of ten.
 */
export async function computeAutoHealth(userId, month) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const salary = await computeSalary(userId, month);

  // Days the person was actually expected in — holidays, weekly offs and
  // not-yet-synced days do not count for or against anyone.
  const c = salary.counts;
  const attended = c.PRESENT + c.WFH + c.HALF_DAY * 0.5;
  const expected = c.PRESENT + c.WFH + c.HALF_DAY + c.LEAVE + salary.absentDays;

  // ── Attendance: how much of the expected time was actually worked ────────
  const attendance =
    expected > 0
      ? { score: clamp10((attended / expected) * 10), detail: `${attended} of ${expected} working days` }
      : null;

  // ── Punctuality: of the days present, how many were on time ──────────────
  const presentDays = c.PRESENT + c.WFH + c.HALF_DAY;
  const onTime = Math.max(0, presentDays - salary.lateDays);
  const punctuality =
    presentDays > 0
      ? { score: clamp10((onTime / presentDays) * 10), detail: `${onTime} of ${presentDays} days on time` }
      : null;

  return { punctuality, attendance };
}

/**
 * Merge the stored card with the live computed figures into one resolved
 * scorecard: every metric with its effective value, whether it is N/A, and the
 * total average of the values that count.
 */
export function resolveHealth(report, auto) {
  const na = new Set(safeArray(report?.naKeys));

  const metrics = HEALTH_METRICS.map((m) => {
    const isNa = na.has(m.key);
    let value = report?.[m.key] ?? null;

    // For an auto metric an unset stored value means "use the computed one".
    if (m.auto && value === null && !isNa) {
      value = auto?.[m.key]?.score ?? null;
    }

    return {
      key: m.key,
      label: m.label,
      auto: Boolean(m.auto),
      na: isNa,
      value: isNa ? null : value,
      computed: m.auto ? (auto?.[m.key]?.score ?? null) : null,
      detail: m.auto ? (auto?.[m.key]?.detail ?? null) : null,
      overridden: Boolean(m.auto && report?.[m.key] != null),
    };
  });

  const scored = metrics.filter((m) => !m.na && m.value != null);
  const total = scored.length
    ? Math.round((scored.reduce((sum, m) => sum + m.value, 0) / scored.length) * 10) / 10
    : null;

  return { metrics, total, scoredCount: scored.length, note: report?.note ?? null };
}

const safeArray = (s) => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
