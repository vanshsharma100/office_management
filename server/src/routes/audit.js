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

    const where = {
      ...(entity ? { entity: String(entity) } : {}),
      ...(entityId ? { entityId: String(entityId) } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
      ...(action ? { action: String(action) } : {}),
      ...(q ? { summary: { contains: String(q) } } : {}),
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

const safeJson = (s) => {
  try {
    return JSON.parse(s ?? '{}');
  } catch {
    return {};
  }
};

export default router;
