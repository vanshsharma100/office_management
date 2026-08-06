import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, can, visibleUsersFilter } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

/** Section 13.5 — questions go to the Super Admin and Admins, kept permanently. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = req.query.scope === 'all' && can(req.user, 'queries.answer');
    const queries = await prisma.query.findMany({
      where: all ? { user: visibleUsersFilter(req.user) } : { userId: req.user.id },
      include: {
        user: { select: { id: true, name: true, employeeId: true, department: { select: { name: true } } } },
        replies: {
          include: { user: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    res.json({ queries });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ subject: z.string().min(3), message: z.string().min(3) })
      .parse(req.body);

    const query = await prisma.query.create({ data: { ...body, userId: req.user.id } });
    await logAudit(req.user, AUDIT.QUERY_RAISED, 'Query', query.id, `Raised a question: "${query.subject}"`);
    res.status(201).json({ query });
  })
);

router.post(
  '/:id/reply',
  asyncHandler(async (req, res) => {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);

    const query = await prisma.query.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!query) throw new HttpError(404, 'Question not found');

    const isOwner = query.userId === req.user.id;
    if (!isOwner && !can(req.user, 'queries.answer')) throw new HttpError(403, 'Not allowed');

    const reply = await prisma.queryReply.create({
      data: { queryId: query.id, userId: req.user.id, message },
      include: { user: { select: { name: true, role: true } } },
    });
    await prisma.query.update({
      where: { id: query.id },
      data: { status: isOwner ? query.status : 'ANSWERED' },
    });

    if (!isOwner) {
      await logAudit(
        req.user,
        AUDIT.QUERY_ANSWERED,
        'Query',
        query.id,
        `Replied to ${query.user.name}'s question "${query.subject}"`
      );
    }

    res.status(201).json({ reply });
  })
);

router.post(
  '/:id/status',
  requirePermission('queries.answer'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']) }).parse(req.body);
    const query = await prisma.query.update({ where: { id: req.params.id }, data: { status } });
    res.json({ query });
  })
);

export default router;
