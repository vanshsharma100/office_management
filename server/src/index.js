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

const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
