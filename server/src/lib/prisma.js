import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma, talking to Postgres through the plain `pg` driver.
 *
 * By default Prisma routes queries through a Rust engine, which on some
 * managed hosts cannot run its own async runtime and dies with
 * "PANIC: timer has gone away" on every single query — the app answers any
 * route that avoids the database and fails on all the rest.
 *
 * The driver adapter hands connection handling to a JavaScript Postgres
 * client instead, so there is no Rust runtime left to fail. Everywhere else
 * this is simply a normal Postgres connection.
 */

const globalForPrisma = globalThis;

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — the server cannot reach a database.');
  }

  const adapter = new PrismaPg({
    connectionString,
    // Shared hosting gives a process very little room, and Supabase's pooler
    // counts every connection. A small pool is plenty for one office.
    max: Number(process.env.DB_POOL_MAX) || 5,
    // Fail rather than wait forever, so a bad connection surfaces as an error
    // in the logs instead of a page that buffers.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.__ftechPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__ftechPrisma = prisma;

export default prisma;
