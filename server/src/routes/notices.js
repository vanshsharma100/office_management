import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, can, visibleUsersFilter } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

/** Notices the caller should see — everyone, their department, or just them. */
function audienceFilter(user) {
  return {
    OR: [
      { audience: 'ALL' },
      { audience: 'DEPARTMENT', departmentId: user.departmentId ?? '__none__' },
      { audience: 'USER', targetUserId: user.id },
    ],
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = req.query.scope === 'all' && can(req.user, 'notices.manage');
    const notices = await prisma.notice.findMany({
      where: all
        ? {}
        : {
            ...audienceFilter(req.user),
            // Nothing from before this person joined. A new starter opening
            // the app should not be handed a year of announcements that were
            // never meant for them, all marked unread.
            createdAt: { gte: req.user.joinDate },
          },
      include: {
        createdBy: { select: { name: true, role: true } },
        department: { select: { name: true } },
        targetUser: { select: { name: true, employeeId: true } },
        reads: { where: { userId: req.user.id }, select: { readAt: true } },
        _count: { select: { reads: true } },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    res.json({
      notices: notices.map((n) => ({
        ...n,
        readByMe: n.reads.length > 0,
        readAt: n.reads[0]?.readAt ?? null,
        readCount: n._count.reads,
      })),
    });
  })
);

router.post(
  '/',
  requirePermission('notices.manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(3),
        body: z.string().min(3),
        audience: z.enum(['ALL', 'DEPARTMENT', 'USER']).default('ALL'),
        departmentId: z.string().nullish(),
        targetUserId: z.string().nullish(),
        pinned: z.boolean().default(false),
      })
      .parse(req.body);

    if (body.audience === 'DEPARTMENT' && !body.departmentId) {
      throw new HttpError(400, 'Choose a department');
    }
    if (body.audience === 'USER' && !body.targetUserId) {
      throw new HttpError(400, 'Choose an employee');
    }

    const notice = await prisma.notice.create({
      data: { ...body, createdById: req.user.id },
      include: { targetUser: { select: { name: true } }, department: { select: { name: true } } },
    });

    await logAudit(
      req.user,
      AUDIT.NOTICE_PUBLISHED,
      'Notice',
      notice.id,
      `Published notice "${notice.title}" to ${
        notice.audience === 'ALL'
          ? 'everyone'
          : notice.targetUser?.name ?? notice.department?.name ?? 'a group'
      }`
    );

    res.status(201).json({ notice });
  })
);

/** Section 13.2 — read tracking. Settles "I never saw that notice". */
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notice = await prisma.notice.findUnique({ where: { id: req.params.id } });
    if (!notice) throw new HttpError(404, 'Notice not found');

    const read = await prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId: notice.id, userId: req.user.id } },
      create: { noticeId: notice.id, userId: req.user.id },
      update: {},
    });
    res.json({ read });
  })
);

router.get(
  '/:id/reads',
  requirePermission('notices.readReceipts'),
  asyncHandler(async (req, res) => {
    const notice = await prisma.notice.findUnique({
      where: { id: req.params.id },
      include: { reads: { include: { user: { select: { id: true, name: true, employeeId: true } } } } },
    });
    if (!notice) throw new HttpError(404, 'Notice not found');

    // Who it was aimed at, so "not read yet" is a real list, not a guess.
    const audience = await prisma.user.findMany({
      where: {
        ...visibleUsersFilter(req.user),
        isActive: true,
        ...(notice.audience === 'DEPARTMENT' ? { departmentId: notice.departmentId } : {}),
        ...(notice.audience === 'USER' ? { id: notice.targetUserId } : {}),
      },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    const readMap = new Map(notice.reads.map((r) => [r.userId, r.readAt]));
    res.json({
      notice: { id: notice.id, title: notice.title },
      read: audience.filter((u) => readMap.has(u.id)).map((u) => ({ ...u, readAt: readMap.get(u.id) })),
      unread: audience.filter((u) => !readMap.has(u.id)),
    });
  })
);

export default router;
