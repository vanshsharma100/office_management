import { z } from 'zod';

/**
 * A 24-hour clock time, or nothing.
 *
 * Shift timings are set in three places — the office policy, a department and
 * a single employee — and all three have to agree on what a valid time looks
 * like, so they share this one definition.
 */
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:30')
  .nullish();

/** Minutes of grace before an arrival counts as late. */
export const graceMinutes = z.number().int().min(0).max(240).nullish();
