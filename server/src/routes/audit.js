import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

/** Section 15 — look up anything, for anyone, for any date range. */
router.get(
  '/',
  requirePermission('audit.view'),
  asyncHandler(async (req, res) => {
    const { entity, entityId, actorId, action, from, to, q } = req.query;
    const take = Math.min(Number(req.query.take) || 100, 500);
    const skip = Number(req.query.skip) || 0;

    // Section 14.2 — the backup Super Admin leaves no trace. Nothing new is
    // written for it (see lib/audit.js); this hides anything already on record
    // from before that rule, and from every viewer including the account
    // itself. Logs with no actor at all are the System's and stay.
    const hiddenIds = await hiddenActorIds();

    const where = {
      ...(hiddenIds.length
        ? {
            AND: [
              { OR: [{ actorId: null }, { actorId: { notIn: hiddenIds } }] },
              { NOT: { entity: 'User', entityId: { in: hiddenIds } } },
            ],
          }
        : {}),
      ...(entity ? { entity: String(entity) } : {}),
      ...(entityId ? { entityId: String(entityId) } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
      ...(action ? { action: String(action) } : {}),
      ...(q ? { summary: { contains: String(q), mode: 'insensitive' } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { actor: { select: { name: true, employeeId: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs: logs.map((l) => ({ ...l, meta: safeJson(l.meta) })),
      total,
      take,
      skip,
    });
  })
);

async function hiddenActorIds() {
  const hidden = await prisma.user.findMany({
    where: { isHidden: true },
    select: { id: true },
  });
  return hidden.map((u) => u.id);
}

const safeJson = (s) => {
  try {
    return JSON.parse(s ?? '{}');
  } catch {
    return {};
  }
};

export default router;
