import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { mailConfig, resetEmail, sendMail } from '../lib/mail.js';
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

// ───────────────────────────────────────────── Getting back in (forgot password)
//
// Public on purpose: somebody who cannot sign in cannot be asked to sign in
// first. Every answer is deliberately identical whether or not the account
// exists, so this cannot be used to discover usernames.

const RESET_MINUTES = 30;
const sameAnswer = {
  ok: true,
  message: 'If that account has a recovery email, a reset link is on its way.',
};

router.post(
  '/forgot',
  asyncHandler(async (req, res) => {
    const { username } = z.object({ username: z.string().min(1).max(60) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });

    // No recovery address, inactive, or no such account — all answer the same.
    if (!user?.isActive || !user.recoveryEmail) return res.json(sameAnswer);

    // One live link at a time; asking again cancels the last one.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
      },
    });

    const { appUrl } = mailConfig();
    const link = `${appUrl}/reset-password?token=${token}`;
    try {
      await sendMail({
        to: user.recoveryEmail,
        ...resetEmail({ name: user.name, link, minutes: RESET_MINUTES }),
      });
      await logAudit(user, AUDIT.PASSWORD_RESET_REQUESTED, 'User', user.id, 'Asked for a password reset link');
    } catch (err) {
      // The caller still gets the same answer — but this must not vanish, or
      // an unconfigured mail server looks exactly like a delivered email.
      console.error('[auth] could not send the reset email:', err.message);
    }

    res.json(sameAnswer);
  })
);

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = z
      .object({
        token: z.string().min(10),
        newPassword: z.string().min(6, 'Use at least 6 characters'),
      })
      .parse(req.body);

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new HttpError(400, 'That link has expired or has already been used. Ask for a new one.');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding link for this account dies with it.
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } }),
    ]);

    await logAudit(row.user, AUDIT.PASSWORD_RESET_COMPLETED, 'User', row.userId, 'Set a new password using a reset link');
    res.json({ ok: true });
  })
);

/** Whether the server can actually send mail — shown on the sign-in screen. */
router.get(
  '/reset-available',
  asyncHandler(async (_req, res) => {
    res.json({ available: mailConfig().configured });
  })
);

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export default router;
