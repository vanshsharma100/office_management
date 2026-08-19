import { addDays, todayISO } from './dates.js';

/**
 * Weeks, for the weekly report (Section 13.6).
 *
 * A week runs Monday to Sunday and is named by its Monday, so "2026-08-10" is
 * one week for everybody. Deriving it from the date rather than storing a week
 * number means two people can never disagree about which week they are in.
 */

/** The Monday on or before a date. */
export function weekStartOf(dateISO = todayISO()) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;
  return addDays(dateISO, -back);
}

export const weekEndOf = (dateISO) => addDays(weekStartOf(dateISO), 6);

/** 0 = Sunday … 6 = Saturday, matching JavaScript and the settings screen. */
export const dayOfWeek = (dateISO) => new Date(`${dateISO}T00:00:00Z`).getUTCDay();

/**
 * Can this week's report still be filled in?
 *
 * The office picks the day the form opens; it then stays open until the week
 * ends. Someone who was on leave or off sick on the chosen day can still
 * submit rather than being marked missing for something they could not do.
 */
export function isWindowOpen(weekStart, openDay, today = todayISO()) {
  if (weekStart !== weekStartOf(today)) return false; // only the current week
  const opensOn = addDays(weekStart, openDay === 0 ? 6 : openDay - 1);
  return today >= opensOn;
}

/** The date the window opens for a given week. */
export const windowOpensOn = (weekStart, openDay) =>
  addDays(weekStart, openDay === 0 ? 6 : openDay - 1);

/**
 * Every week start from `weeks` ago up to the current one, newest first. Used
 * to show a run of weeks with their reports, and the gaps where none exists.
 */
export function recentWeekStarts(weeks = 8, today = todayISO()) {
  const current = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * i));
}

/**
 * The same list, stopping at the week somebody joined.
 *
 * Without this a new starter opens the screen to a wall of red for weeks they
 * were not employed — which is not a missing report, it is a report that was
 * never owed. The joining week itself counts, so somebody who started on the
 * Tuesday still sees that week.
 */
export function weekStartsSinceJoining(weeks, joinDate, today = todayISO()) {
  const firstWeek = weekStartOf(toISODate(joinDate) ?? today);
  return recentWeekStarts(weeks, today).filter((w) => w >= firstWeek);
}

/**
 * YYYY-MM-DD from either a Date or a string.
 *
 * Prisma hands back Date objects while the rest of this file speaks in date
 * strings, and `String(aDate).slice(0, 10)` yields "Fri Aug 14" — which looks
 * like a date and parses as nothing.
 */
export function toISODate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
