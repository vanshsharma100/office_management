import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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
import { errorHandler, notFound } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'ftech-office-api', time: new Date().toISOString() })
  );

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
