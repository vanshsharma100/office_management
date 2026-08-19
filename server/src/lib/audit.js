import prisma from './prisma.js';

/**
 * Section 15 — the history rule. Nothing is thrown away, and *who* did it
 * matters as much as what changed.
 *
 * Section 14.2 is the one exception: the hidden backup Super Admin writes no
 * history at all. Filtering it out of the log would still leave the rows in
 * the database for a dump or a raw query to find, and the point of that
 * account is that its use leaves no trace anywhere — including from itself.
 */
export async function logAudit(actor, action, entity, entityId, summary, meta = {}) {
  if (actor?.isHidden) return;

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
