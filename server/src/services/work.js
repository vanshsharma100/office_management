import prisma from '../lib/prisma.js';
import { SUBMISSION_STATUS, QUESTION_TYPES } from '../lib/constants.js';

/**
 * Only APPROVED work counts (Section 10). With Autopilot on, submissions are
 * stamped APPROVED at submit time, so this single rule covers both modes.
 */
const countsFilter = { status: SUBMISSION_STATUS.APPROVED };

/** Totals per question for a set of submissions in a date range. */
export async function workTotals({ userIds, departmentId, from, to }) {
  const entries = await prisma.workEntry.findMany({
    where: {
      submission: {
        ...countsFilter,
        date: { gte: from, lte: to },
        ...(userIds ? { userId: { in: userIds } } : {}),
        ...(departmentId ? { user: { departmentId } } : {}),
      },
    },
    include: { question: { include: { jobRole: true } } },
  });

  const byQuestion = new Map();
  let totalUnits = 0;
  let checked = 0;
  let failed = 0;

  for (const e of entries) {
    const q = e.question;
    const row = byQuestion.get(q.id) ?? {
      questionId: q.id,
      key: q.key,
      label: q.label,
      labelHi: q.labelHi,
      unit: q.unit,
      type: q.type,
      jobRole: q.jobRole?.name ?? '',
      value: 0,
      failed: 0,
    };
    row.value += e.value;
    row.failed += e.failedValue;
    byQuestion.set(q.id, row);

    totalUnits += e.value;
    if (q.type === QUESTION_TYPES.CHECK_FAIL) {
      checked += e.value;
      failed += e.failedValue;
    }
  }

  const rows = [...byQuestion.values()].sort((a, b) => b.value - a.value);
  return {
    rows,
    totalUnits,
    checked,
    failed,
    // Section 9.2 — volume alone doesn't show whether quality is slipping.
    defectRate: checked > 0 ? Math.round((failed / checked) * 1000) / 10 : 0,
  };
}

/** Day-by-day series for the work-progress graph (Section 8.1). */
export async function workSeries({ userIds, departmentId, dates }) {
  if (!dates.length) return [];
  const from = dates[0];
  const to = dates[dates.length - 1];

  const submissions = await prisma.workSubmission.findMany({
    where: {
      ...countsFilter,
      date: { gte: from, lte: to },
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...(departmentId ? { user: { departmentId } } : {}),
    },
    include: { entries: true },
  });

  const totals = new Map(dates.map((d) => [d, 0]));
  for (const s of submissions) {
    const sum = s.entries.reduce((acc, e) => acc + e.value, 0);
    totals.set(s.date, (totals.get(s.date) ?? 0) + sum);
  }
  return dates.map((date) => ({ date, total: totals.get(date) ?? 0 }));
}

/** The exact question set an employee should see (Section 4). */
export async function questionsForUser(userId) {
  const links = await prisma.userJobRole.findMany({
    where: { userId },
    include: {
      jobRole: {
        include: {
          questions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          department: true,
        },
      },
    },
  });

  return links
    .filter((l) => l.jobRole?.isActive)
    .sort((a, b) => a.jobRole.sortOrder - b.jobRole.sortOrder)
    .map((l) => ({
      jobRoleId: l.jobRole.id,
      jobRole: l.jobRole.name,
      jobRoleHi: l.jobRole.nameHi,
      department: l.jobRole.department?.name,
      questions: l.jobRole.questions,
    }));
}
