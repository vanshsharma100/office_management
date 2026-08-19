import prisma from './prisma.js';

/**
 * Office-wide switches that are too small to deserve their own table.
 *
 * Everything is stored as text in the Setting table and read back through a
 * default, so a missing row behaves exactly like a fresh install rather than
 * throwing somewhere far away from the cause.
 */

export const SETTING = {
  WEEKLY_REPORT_ENABLED: 'weeklyReport.enabled',
  WEEKLY_REPORT_OPEN_DAY: 'weeklyReport.openDay',
};

/** Sunday = 0. Saturday is the usual answer for a weekly wrap-up. */
export const DEFAULTS = {
  [SETTING.WEEKLY_REPORT_ENABLED]: 'true',
  [SETTING.WEEKLY_REPORT_OPEN_DAY]: '6',
};

export async function getSetting(key) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

export async function setSetting(key, value) {
  const next = String(value);
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: next },
    update: { value: next },
  });
  return next;
}

/** The weekly report's rules, in the shape the routes and the UI both use. */
export async function getWeeklyReportConfig() {
  const [enabled, openDay] = await Promise.all([
    getSetting(SETTING.WEEKLY_REPORT_ENABLED),
    getSetting(SETTING.WEEKLY_REPORT_OPEN_DAY),
  ]);
  return {
    enabled: enabled === 'true',
    openDay: Math.min(6, Math.max(0, Number(openDay) || 0)),
  };
}
