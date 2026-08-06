import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';
import { publicUser } from '../services/serialize.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { department: true, jobRoles: { include: { jobRole: true } } },
    });

    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Wrong username or password');
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await logAudit(user, AUDIT.LOGIN, 'User', user.id, `${user.name} signed in`);

    const token = signToken(user);
    res.cookie?.('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ token, user: publicUser(user) });
  })
);

router.post('/logout', (_req, res) => {
  res.clearCookie?.('token');
  res.json({ ok: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, 'Use at least 6 characters'),
      })
      .parse(req.body);

    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) throw new HttpError(400, 'Your current password is not correct');

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
    });
    await logAudit(req.user, AUDIT.PASSWORD_CHANGED, 'User', req.user.id, 'Changed own password');

    res.json({ ok: true });
  })
);

export default router;
