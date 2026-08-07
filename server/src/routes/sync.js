import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma.js';
import { requireAgent, generateAgentKey } from '../middleware/agentAuth.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { logAudit } from '../lib/audit.js';
import { deriveDate, getPolicy } from '../services/attendanceDerive.js';
import { AUDIT } from '../lib/constants.js';

/**
 * The office PC's sync agent talks to these endpoints, and nothing else does.
 * Every call is outbound from the office — no port is opened on that machine,
 * and the SQL Server credentials never leave it.
 */
const router = Router();

// Generous enough for a batch every minute, tight enough that a leaked key
// cannot be used to hammer the API.
const ingestLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────── Agent-facing (bearer key)

/** Handshake: confirms the key works and tells the agent where to resume. */
router.post(
  '/hello',
  ingestLimit,
  requireAgent,
  asyncHandler(async (req, res) => {
    const [policy, latest] = await Promise.all([
      getPolicy(),
      prisma.biometricPunch.findFirst({ orderBy: { punchAt: 'desc' }, select: { punchAt: true } }),
    ]);
    res.json({
      ok: true,
      agent: { id: req.agent.id, name: req.agent.name },
      serverTime: new Date().toISOString(),
      timezone: policy.timezone,
      lastPunchAt: latest?.punchAt ?? null,
    });
  })
);

const punchSchema = z.object({
  uid: z.string().min(1).max(64),
  punchAt: z.string().datetime({ offset: true }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(['IN', 'OUT']).nullish(),
  deviceId: z.string().max(64).nullish(),
  sourceKey: z.string().min(1).max(200),
});

/**
 * Ingest a batch of punches. Idempotent by sourceKey, so the agent can re-send
 * anything it is unsure about — which is exactly what it does after the office
 * PC has been off and it is working through a backlog.
 */
router.post(
  '/punches',
  ingestLimit,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { punches } = z
      .object({ punches: z.array(punchSchema).max(2000) })
      .parse(req.body);

    // Resolve device UIDs to employees in one pass. Unknown UIDs are still
    // stored, unlinked, so a new joiner's work is never silently discarded —
    // they surface in the mapping screen instead.
    const uids = [...new Set(punches.map((p) => p.uid))];
    const users = await prisma.user.findMany({
      where: { biometricId: { in: uids } },
      select: { id: true, biometricId: true },
    });
    const userByUid = new Map(users.map((u) => [u.biometricId, u.id]));

    // Which of these have we already got? Upsert alone cannot tell us, and the
    // agent uses the "stored" count to know its backlog is actually shrinking.
    const known = await prisma.biometricPunch.findMany({
      where: { sourceKey: { in: punches.map((p) => p.sourceKey) } },
      select: { sourceKey: true },
    });
    const knownKeys = new Set(known.map((k) => k.sourceKey));
    const inserted = punches.filter((p) => !knownKeys.has(p.sourceKey)).length;

    for (const p of punches) {
      await prisma.biometricPunch.upsert({
        where: { sourceKey: p.sourceKey },
        create: {
          uid: p.uid,
          punchAt: new Date(p.punchAt),
          date: p.date,
          direction: p.direction ?? null,
          deviceId: p.deviceId ?? null,
          sourceKey: p.sourceKey,
          userId: userByUid.get(p.uid) ?? null,
        },
        // A re-sent punch may now belong to a UID that has since been mapped.
        update: { userId: userByUid.get(p.uid) ?? undefined },
      });
    }

    await prisma.syncAgent.update({
      where: { id: req.agent.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });

    res.json({ ok: true, received: punches.length, stored: inserted });
  })
);

/**
 * "I have collected everything for this date." Only now may a day with no
 * punches be read as an absence — before this, the date is NA.
 */
router.post(
  '/day-complete',
  ingestLimit,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { date, punchCount, isComplete } = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        punchCount: z.number().int().min(0).default(0),
        isComplete: z.boolean().default(true),
      })
      .parse(req.body);

    await prisma.attendanceSyncDay.upsert({
      where: { date },
      create: { date, punchCount, isComplete, agentId: req.agent.id },
      update: { punchCount, isComplete, agentId: req.agent.id, syncedAt: new Date() },
    });

    const result = await deriveDate(date);
    res.json({ ok: true, ...result });
  })
);

/** Lets the agent report a failure so it shows up in the app, not just a log. */
router.post(
  '/error',
  ingestLimit,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { message } = z.object({ message: z.string().max(500) }).parse(req.body);
    await prisma.syncAgent.update({
      where: { id: req.agent.id },
      data: { lastError: message },
    });
    res.json({ ok: true });
  })
);

// ──────────────────────────────────────────── Management (signed-in humans)

const admin = Router();
admin.use(requireAuth, requireSuperAdmin);

/** Sync health. Stale means salary is being computed on ageing data. */
admin.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [agents, lastDay, naDates, unmapped] = await Promise.all([
      prisma.syncAgent.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.attendanceSyncDay.findFirst({ orderBy: { date: 'desc' } }),
      prisma.attendanceSyncDay.count(),
      prisma.biometricPunch.findMany({
        where: { userId: null },
        distinct: ['uid'],
        select: { uid: true, punchAt: true },
        orderBy: { punchAt: 'desc' },
        take: 50,
      }),
    ]);

    res.json({
      agents: agents.map(({ keyHash, ...rest }) => rest), // never leak the hash
      lastSyncedDate: lastDay?.date ?? null,
      lastSyncedAt: lastDay?.syncedAt ?? null,
      syncedDayCount: naDates,
      unmappedUids: unmapped,
    });
  })
);

/** Register an office PC. The key is shown once, here, and never again. */
admin.post(
  '/agents',
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(2).max(60) }).parse(req.body);
    const { key, keyHash, keyPrefix } = generateAgentKey();

    const agent = await prisma.syncAgent.create({
      data: { name, keyHash, keyPrefix, createdById: req.user.id },
    });
    await logAudit(req.user, AUDIT.SYNC_AGENT_CREATED, 'SyncAgent', agent.id, `Registered sync agent ${name}`);

    const { keyHash: _hidden, ...safe } = agent;
    res.status(201).json({ agent: safe, key });
  })
);

/** Revoke a lost or replaced office PC. Nothing else is affected. */
admin.delete(
  '/agents/:id',
  asyncHandler(async (req, res) => {
    const agent = await prisma.syncAgent.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    await logAudit(req.user, AUDIT.SYNC_AGENT_REVOKED, 'SyncAgent', agent.id, `Revoked sync agent ${agent.name}`);
    res.json({ ok: true });
  })
);

/** Link a device UID to an employee, then backfill their existing punches. */
admin.post(
  '/map-uid',
  asyncHandler(async (req, res) => {
    const { uid, userId } = z
      .object({ uid: z.string().min(1).max(64), userId: z.string().min(1) })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'Employee not found');

    await prisma.user.update({ where: { id: userId }, data: { biometricId: uid } });
    const { count } = await prisma.biometricPunch.updateMany({
      where: { uid, userId: null },
      data: { userId },
    });

    // Recompute every day those punches touch, so the mapping applies to
    // history and not only to punches that arrive from now on.
    const dates = await prisma.biometricPunch.findMany({
      where: { uid },
      distinct: ['date'],
      select: { date: true },
    });
    for (const { date } of dates) await deriveDate(date);

    await logAudit(
      req.user,
      AUDIT.BIOMETRIC_MAPPED,
      'User',
      userId,
      `Mapped device UID ${uid} to ${user.name}`
    );
    res.json({ ok: true, linkedPunches: count, recalculatedDays: dates.length });
  })
);

/** Re-run derivation for a date range — used after a policy change. */
admin.post(
  '/recalculate',
  asyncHandler(async (req, res) => {
    const { from, to } = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);

    const days = await prisma.attendanceSyncDay.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const results = [];
    for (const day of days) results.push(await deriveDate(day.date));

    await logAudit(
      req.user,
      AUDIT.ATTENDANCE_RECALCULATED,
      'Attendance',
      null,
      `Recalculated attendance ${from} → ${to} (${days.length} days)`
    );
    res.json({ ok: true, days: results.length, results });
  })
);

router.use('/', admin);

export default router;
