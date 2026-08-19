import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

/**
 * Starting a fresh year.
 *
 * The reset clears the record — attendance, work, leave, tasks, pay lines —
 * and keeps the people: accounts, passwords, roles, departments, job roles and
 * questions all survive, so nobody has to be set up again.
 *
 * Nothing is thrown away. Everything removed is written to a DataArchive row
 * first, in one transaction with the deletion, so the archive cannot exist
 * without the delete having happened or the other way round. The archive stays
 * downloadable afterwards.
 *
 * The history log is deliberately NOT cleared. It is the record of who did
 * what, including this reset; wiping it would erase the evidence of the very
 * action being audited.
 */
const router = Router();
router.use(requireAuth, requireSuperAdmin);

/** Each kind of record, how to count it, read it, and remove it. */
const TABLES = [
  ['workEntry', 'Work entry lines'],
  ['workSubmission', 'Daily work submissions'],
  ['weeklyReport', 'Weekly reports'],
  ['attendance', 'Attendance days'],
  ['attendanceRequest', 'Presence requests'],
  ['biometricPunch', 'Machine punches'],
  ['attendanceSyncDay', 'Synced days'],
  ['leaveRequest', 'Leave requests'],
  ['taskResponse', 'Task responses'],
  ['task', 'Tasks'],
  ['noticeRead', 'Notice reads'],
  ['notice', 'Notices'],
  ['queryReply', 'Question replies'],
  ['query', 'Questions raised'],
  ['payItem', 'Incentives / bonuses / deductions'],
  ['monthLock', 'Month locks'],
  ['holiday', 'Declared holidays'],
];

async function countAll() {
  const entries = await Promise.all(
    TABLES.map(async ([model, label]) => [model, { label, count: await prisma[model].count() }])
  );
  return Object.fromEntries(entries);
}

/** What a reset would remove, so the confirmation screen states real numbers. */
router.get(
  '/reset/preview',
  asyncHandler(async (_req, res) => {
    const counts = await countAll();
    res.json({
      counts,
      total: Object.values(counts).reduce((sum, c) => sum + c.count, 0),
      kept: await prisma.user.count(),
    });
  })
);

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const { password, confirm } = z
      .object({ password: z.string().min(1), confirm: z.string() })
      .parse(req.body);

    // Typing the word is not security, it is a speed bump against a misclick.
    // The password is the actual gate.
    if (confirm !== 'RESET') throw new HttpError(400, 'Type RESET to confirm');

    const me = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(password, me.passwordHash))) {
      throw new HttpError(403, 'That password is not correct');
    }

    const counts = await countAll();
    const total = Object.values(counts).reduce((sum, c) => sum + c.count, 0);
    if (total === 0) throw new HttpError(400, 'There is nothing to reset — the record is already empty');

    // Read everything out before touching it.
    const payload = {};
    for (const [model] of TABLES) payload[model] = await prisma[model].findMany();
    payload.usersAtReset = (await prisma.user.findMany()).map((u) => ({
      id: u.id,
      employeeId: u.employeeId,
      name: u.name,
      role: u.role,
      departmentId: u.departmentId,
    }));

    const label = `Reset on ${new Date().toLocaleString('en-GB')}`;

    // One transaction: the archive and the deletion stand or fall together.
    // Order matters — children before the rows they point at.
    await prisma.$transaction([
      prisma.dataArchive.create({
        data: {
          label,
          createdById: req.user.id,
          createdByName: req.user.name,
          counts: JSON.stringify(counts),
          payload: JSON.stringify(payload),
        },
      }),
      ...TABLES.map(([model]) => prisma[model].deleteMany({})),
    ]);

    await logAudit(
      req.user,
      AUDIT.DATA_RESET,
      'DataArchive',
      null,
      `Reset the record — ${total} rows archived and cleared. Employees, roles and passwords kept.`,
      { counts }
    );

    res.json({ ok: true, archived: total, label });
  })
);

/** Past resets, newest first. The payload is far too big to list. */
router.get(
  '/archives',
  asyncHandler(async (_req, res) => {
    const archives = await prisma.dataArchive.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, createdByName: true, counts: true, createdAt: true },
    });
    res.json({
      archives: archives.map((a) => {
        const counts = safeJson(a.counts);
        return {
          ...a,
          counts,
          total: Object.values(counts).reduce((sum, c) => sum + (c.count ?? 0), 0),
        };
      }),
    });
  })
);

router.get(
  '/archives/:id/download',
  asyncHandler(async (req, res) => {
    const archive = await prisma.dataArchive.findUnique({ where: { id: req.params.id } });
    if (!archive) throw new HttpError(404, 'Archive not found');

    await logAudit(
      req.user,
      AUDIT.REPORT_EXPORTED,
      'DataArchive',
      archive.id,
      `Downloaded the archive "${archive.label}"`
    );

    const stamp = archive.createdAt.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ftech-archive-${stamp}.json"`);
    res.send(
      JSON.stringify(
        { label: archive.label, takenBy: archive.createdByName, takenAt: archive.createdAt, counts: safeJson(archive.counts), data: safeJson(archive.payload) },
        null,
        2
      )
    );
  })
);

const safeJson = (s) => {
  try {
    return JSON.parse(s ?? '{}');
  } catch {
    return {};
  }
};

export default router;
