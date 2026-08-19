import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import prisma from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import workRoutes from './routes/work.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leave.js';
import taskRoutes from './routes/tasks.js';
import noticeRoutes from './routes/notices.js';
import queryRoutes from './routes/queries.js';
import salaryRoutes from './routes/salary.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
import syncRoutes from './routes/sync.js';
import brandingRoutes from './routes/branding.js';
import weeklyRoutes from './routes/weekly.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';
import { errorHandler, notFound } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Host and port the database lives at — never the credentials in front of them. */
function dbTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return { host: url.hostname, port: Number(url.port) || 5432 };
  } catch {
    return null;
  }
}

/**
 * Can this machine open a socket there at all?
 *
 * A refusal is a server saying no, and arrives at once. Silence until the
 * deadline is a firewall swallowing the packets — the usual shape of a host
 * that only lets port 80 and 443 out.
 */
function probeTcp({ host, port }, ms = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(ms, () => finish(`no answer in ${ms}ms — port ${port} is probably blocked outbound`));
    socket.once('connect', () => finish('ok — the port is open, so the failure is past the network'));
    socket.once('error', (e) => finish(e.code || e.message));
  });
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  // Brute-force guard on sign-in only; the rest of the app is chatty by design.
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false })
  );

  // Tighter still on the reset endpoints: they send email and hand out keys to
  // an account, so they must not be usable to flood an inbox or grind tokens.
  app.use(
    ['/api/auth/forgot', '/api/auth/reset'],
    rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false })
  );

  /**
   * Health, including the database.
   *
   * The probe is raced against a timeout on purpose. When Prisma cannot start
   * its engine it does not fail — it waits, so every request that touches data
   * buffers forever while routes that avoid it look perfectly healthy. This
   * turns that into an answer you can read from outside.
   */
  app.get('/api/health', async (_req, res) => {
    const base = { ok: true, service: 'ftech-office-api', time: new Date().toISOString() };
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('database did not respond within 5s')), 5000)
        ),
      ]);
      res.json({ ...base, db: 'up' });
    } catch (err) {
      // "Did not respond" is true and useless: a blocked outbound port, a wrong
      // password and a paused database look identical from out here, and they
      // have nothing in common as fixes. Opening a bare socket to the same host
      // and port separates the one case from the other two.
      const target = dbTarget();
      const reach = target ? await probeTcp(target) : 'DATABASE_URL is missing or unparseable';
      res.status(503).json({
        ...base,
        ok: false,
        db: 'down',
        dbError: String(err.message).slice(0, 300),
        target: target ? `${target.host}:${target.port}` : null,
        reachable: reach,
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/work', workRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/leave', leaveRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/notices', noticeRoutes);
  app.use('/api/queries', queryRoutes);
  app.use('/api/salary', salaryRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/branding', brandingRoutes);
  app.use('/api/weekly', weeklyRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/health-score', healthRoutes);

  // In production the API also serves the built frontend, so one container
  // and one port is all a deployment needs.
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

export default createApp;
