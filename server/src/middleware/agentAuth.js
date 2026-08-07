import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { HttpError } from './error.js';

/**
 * Authentication for the office-PC sync agent.
 *
 * The agent presents a bearer key. We store only its SHA-256, so a stolen
 * database yields nothing that can be used to push attendance — the key itself
 * exists in exactly two places: the agent's config file on the office PC, and
 * the screen it was shown on once at creation.
 *
 * SHA-256 rather than bcrypt is deliberate here: the key is 32 bytes of
 * randomness we generated, not a human password, so there is no dictionary to
 * attack and no need to make verification slow on every batch.
 *
 * Replay is handled two ways rather than by signing the body. A request older
 * than the window is rejected outright, and ingest is idempotent — replaying a
 * captured batch writes nothing new, because every punch carries a unique
 * sourceKey. Signing would mean keeping the raw key server-side to verify
 * against, which is a worse trade than relying on TLS plus idempotency.
 */

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

export function generateAgentKey() {
  const key = `ftk_${crypto.randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 12) };
}

export async function requireAgent(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const key = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!key) throw new HttpError(401, 'Agent key required');

    const agent = await prisma.syncAgent.findFirst({ where: { keyHash: hashKey(key) } });
    // Same message either way — a caller must not learn whether a key exists.
    if (!agent || !agent.isActive) throw new HttpError(401, 'Invalid agent key');

    const sent = Number(req.headers['x-agent-timestamp']);
    if (!Number.isFinite(sent)) throw new HttpError(401, 'Missing x-agent-timestamp');
    if (Math.abs(Date.now() - sent) > TIMESTAMP_WINDOW_MS) {
      throw new HttpError(401, 'Request timestamp outside the accepted window');
    }

    await prisma.syncAgent.update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date() },
    });

    req.agent = agent;
    next();
  } catch (err) {
    next(err);
  }
}
