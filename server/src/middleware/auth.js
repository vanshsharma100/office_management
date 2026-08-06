import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { ROLES } from '../lib/constants.js';
import { HttpError } from './error.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
    if (!token) throw new HttpError(401, 'Not signed in');

    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch {
      throw new HttpError(401, 'Session expired — please sign in again');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        department: true,
        jobRoles: { include: { jobRole: { include: { questions: true } } } },
      },
    });
    if (!user) throw new HttpError(401, 'Account not found');
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated');

    user.permissionList = safeParse(user.permissions);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function safeParse(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const isSuperAdmin = (user) => user?.role === ROLES.SUPER_ADMIN;
export const isAdminish = (user) => user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.ADMIN;

/** A Super Admin always passes. An Admin passes only if the switch is on. */
export function can(user, permission) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (user.role !== ROLES.ADMIN) return false;
  return (user.permissionList || []).includes(permission);
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not signed in'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have access to this section'));
    }
    next();
  };
}

export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not signed in'));
    if (!can(req.user, permission)) {
      return next(new HttpError(403, 'You do not have access to this section'));
    }
    next();
  };
}

/**
 * Section 7.2 — hard limits that cannot be granted by anyone.
 * `action` is one of: salary | attendance | leave | work
 */
export function assertNotSelfAction(actor, targetUserId, action) {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (actor.id === targetUserId) {
    const messages = {
      salary: 'An Admin cannot edit their own salary, incentive, bonus or deduction',
      attendance: 'An Admin cannot edit their own attendance',
      leave: 'An Admin cannot approve their own leave request',
      work: 'An Admin cannot approve their own work submission',
    };
    throw new HttpError(403, messages[action] || 'Admins cannot perform this action on themselves');
  }
}

/** Section 7.2 — Managers sit above Admins on pay. */
export function assertCanTouchPay(actor, targetUser) {
  assertNotSelfAction(actor, targetUser.id, 'salary');
  if (actor.role !== ROLES.SUPER_ADMIN && targetUser.isManager) {
    throw new HttpError(403, "Only the Super Admin can change a Manager's salary");
  }
}

/** Section 14.2 — the backup account is invisible to everyone but its holder. */
export function assertVisible(actor, targetUser) {
  if (!targetUser) throw new HttpError(404, 'Not found');
  if (targetUser.isHidden && actor.id !== targetUser.id) {
    throw new HttpError(404, 'Not found');
  }
}

/** Filter applied to every listing so hidden accounts never leak. */
export const visibleUsersFilter = (actor) =>
  actor?.isHidden ? {} : { isHidden: false };
