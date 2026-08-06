import prisma from './prisma.js';

/**
 * Section 15 — the history rule. Nothing is thrown away, and *who* did it
 * matters as much as what changed.
 */
export async function logAudit(actor, action, entity, entityId, summary, meta = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? 'System',
        action,
        entity,
        entityId: entityId ?? null,
        summary,
        meta: JSON.stringify(meta ?? {}),
      },
    });
  } catch (err) {
    // Never let an audit failure break the operation the user asked for.
    console.error('[audit] failed to write log:', err.message);
  }
}

export default logAudit;
