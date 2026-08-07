// Must come first: repairs Prisma's engine permissions before the client is
// loaded. Without it a managed host can leave the engine unexecutable and
// every database query hangs rather than failing.
import './lib/ensureEngines.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import prisma from './lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SQLite needs its folder to exist before the first connection.
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// API_PORT wins so a PORT injected by a dev launcher (which usually means the
// frontend's port) can never take the API's socket.
const PORT = Number(process.env.API_PORT) || Number(process.env.PORT) || 4000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`\n  Ftech Office API  →  http://localhost:${PORT}/api`);
  console.log(`  Health check      →  http://localhost:${PORT}/api/health\n`);
});

/**
 * Say in the log whether the database actually answers.
 *
 * A Prisma engine that cannot start does not throw — it waits. The server then
 * looks perfectly healthy while every request that reads data buffers forever.
 * One query at boot, with a deadline, turns that into a line someone can read.
 */
(async () => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('no response within 10s')), 10_000)
      ),
    ]);
    console.log('  Database          →  connected\n');
  } catch (err) {
    console.error(`\n  DATABASE UNREACHABLE — ${err.message}`);
    console.error(`  DATABASE_URL is ${process.env.DATABASE_URL ? 'set' : 'MISSING'}`);
    console.error(`  Data directory: ${dataDir} (exists: ${fs.existsSync(dataDir)})`);
    console.error('  Every request that reads or writes data will fail until this is fixed.\n');
  }
})();

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
