import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const require = createRequire(import.meta.url);

/**
 * Neon's driver is loaded, not imported.
 *
 * A top-level import that throws takes the whole process down before a single
 * line reaches the log, and a host that answers with its own 503 page tells
 * you nothing about why. That is not a hypothetical: @neondatabase/serverless
 * 1.x declares engines >=19, and on an older Node the app simply stopped
 * existing. Loading it in a try means the worst case is a database that does
 * not work — which /api/health can then say out loud — rather than a site that
 * is gone.
 */
let PrismaNeon = null;
let neonConfig = null;
let neonLoadError = null;
try {
  ({ PrismaNeon } = require('@prisma/adapter-neon'));
  ({ neonConfig } = require('@neondatabase/serverless'));
} catch (err) {
  neonLoadError = String(err.message).slice(0, 200);
}

/**
 * Prisma, talking to Postgres through a JavaScript driver rather than Prisma's
 * own engine.
 *
 * By default Prisma routes queries through a Rust engine, which on some
 * managed hosts cannot run its own async runtime and dies with
 * "PANIC: timer has gone away" on every single query — the app answers any
 * route that avoids the database and fails on all the rest.
 *
 * The driver adapter hands connection handling to a JavaScript Postgres
 * client instead, so there is no Rust runtime left to fail. Which client
 * depends on where the database is; see below.
 */

const globalForPrisma = globalThis;

/**
 * Which driver ended up being used, for /api/health to report.
 *
 * Worth surfacing: "the database does not answer" means opposite things
 * depending on this, and a deploy that quietly shipped the wrong code looks
 * identical from outside to one that shipped the right code and still fails.
 */
export let dbDriver = 'not-initialised';

/** Neon hosts are the ones reachable over HTTPS instead of a Postgres socket. */
function isNeon(connectionString) {
  try {
    return new URL(connectionString).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

/**
 * Pick the driver from where the database actually lives.
 *
 * A normal Postgres connection needs port 5432 (or 6543) open outbound, which
 * is not a given. Shared hosting frequently accepts the TCP handshake and then
 * silently drops everything after it — the port scans as open, the database
 * never answers, and no error is ever returned. Neon's driver sidesteps that
 * entirely by carrying queries as ordinary HTTPS requests on 443, which a host
 * cannot filter without breaking the website it is serving.
 *
 * Anywhere the database is reachable normally — a container beside the app, a
 * VPS, a laptop — plain `pg` stays the better choice: one connection, no
 * request per query.
 */
function createAdapter(connectionString) {
  if (isNeon(connectionString) && !PrismaNeon) {
    // Say so rather than quietly using pg against a host that will not answer
    // it — the symptom would be an unreachable database with no stated cause.
    dbDriver = `pg (neon driver failed to load: ${neonLoadError})`;
  } else if (isNeon(connectionString)) {
    // Ordinary queries as HTTPS requests rather than over a socket.
    neonConfig.poolQueryViaFetch = true;

    // $transaction still needs a real socket. Node 20+ has a global WebSocket
    // and it speaks WSS on 443, so it passes the same filtering that blocks
    // 5432. Without this the batch writes in admin, auth and departments fail
    // while every ordinary query keeps working — a confusing way to find out.
    if (!neonConfig.webSocketConstructor && typeof WebSocket !== 'undefined') {
      neonConfig.webSocketConstructor = WebSocket;
    }

    dbDriver = 'neon-http';
    return new PrismaNeon({ connectionString });
  }

  if (dbDriver === 'not-initialised') dbDriver = 'pg';
  return new PrismaPg({
    connectionString,
    // Shared hosting gives a process very little room, and a pooler counts
    // every connection. A small pool is plenty for one office.
    max: Number(process.env.DB_POOL_MAX) || 5,
    // Fail rather than wait forever, so a bad connection surfaces as an error
    // in the logs instead of a page that buffers.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — the server cannot reach a database.');
  }

  return new PrismaClient({
    adapter: createAdapter(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.__ftechPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__ftechPrisma = prisma;

export default prisma;
