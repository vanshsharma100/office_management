import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { AUDIT } from '../lib/constants.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requirePermission, can } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

/** Tasks visible to the caller: theirs, or everything with permission. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'all' && can(req.user, 'tasks.manage') ? 'all' : 'mine';

    const where =
      scope === 'all'
        ? {}
        : {
            OR: [
              { assigneeId: req.user.id },
              { assigneeId: null, departmentId: req.user.departmentId ?? '__none__' },
            ],
          };

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, employeeId: true } },
        department: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        responses: {
          include: { user: { select: { id: true, name: true, employeeId: true } } },
        },
      },
      orderBy: [{ isOpen: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const shaped = tasks.map((t) => ({
      ...t,
      myResponse: t.responses.find((r) => r.userId === req.user.id) ?? null,
      overdue: t.dueDate ? new Date(t.dueDate) < new Date() : false,
    }));

    res.json({ tasks: shaped });
  })
);

router.post(
  '/',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(3),
        description: z.string().nullish(),
        departmentId: z.string().nullish(),
        assigneeId: z.string().nullish(),
        dueDate: z.string().nullish(),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
      })
      .parse(req.body);

    if (!body.departmentId && !body.assigneeId) {
      throw new HttpError(400, 'Choose a department or a specific employee');
    }

    const task = await prisma.task.create({
      data: {
        ...body,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdById: req.user.id,
      },
      include: { assignee: { select: { name: true } }, department: { select: { name: true } } },
    });

    await logAudit(
      req.user,
      AUDIT.TASK_CREATED,
      'Task',
      task.id,
      `Assigned task "${task.title}" to ${task.assignee?.name ?? task.department?.name ?? 'everyone'}`,
      body
    );
    res.status(201).json({ task });
  })
);

/** Section 13.3 — respond before or after the deadline; either way it's recorded. */
router.post(
  '/:id/respond',
  asyncHandler(async (req, res) => {
    const { response, note } = z
      .object({
        response: z.enum(['COMPLETE', 'NOT_COMPLETE', 'NOTE']),
        note: z.string().nullish(),
      })
      .parse(req.body);

    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { department: true },
    });
    if (!task) throw new HttpError(404, 'Task not found');

    const isMine =
      task.assigneeId === req.user.id ||
      (!task.assigneeId && task.departmentId === req.user.departmentId);
    if (!isMine) throw new HttpError(403, 'This task is not assigned to you');

    const onTime = task.dueDate ? new Date() <= new Date(task.dueDate) : true;

    // Autopilot ON → a completion counts straight away (Section 10.3).
    const autopilot = task.department?.autopilot ?? false;
    const status = response === 'COMPLETE' && !autopilot ? 'PENDING' : 'APPROVED';

    const saved = await prisma.taskResponse.upsert({
      where: { taskId_userId: { taskId: task.id, userId: req.user.id } },
      create: { taskId: task.id, userId: req.user.id, response, note: note ?? null, onTime, status },
      update: { response, note: note ?? null, onTime, status, reviewedById: null, reviewedAt: null },
    });

    await logAudit(
      req.user,
      AUDIT.TASK_RESPONDED,
      'TaskResponse',
      saved.id,
      `Responded "${response}" to task "${task.title}"${onTime ? '' : ' (after the deadline)'}`,
      { note, onTime }
    );

    res.json({ response: saved });
  })
);

router.post(
  '/responses/:id/review',
  requirePermission('tasks.approve'),
  asyncHandler(async (req, res) => {
    const { decision, note } = z
      .object({ decision: z.enum(['APPROVE', 'REJECT']), note: z.string().nullish() })
      .parse(req.body);

    const response = await prisma.taskResponse.findUnique({
      where: { id: req.params.id },
      include: { task: true, user: { select: { name: true, id: true } } },
    });
    if (!response) throw new HttpError(404, 'Not found');
    if (response.userId === req.user.id && req.user.role !== 'SUPER_ADMIN') {
      throw new HttpError(403, 'An Admin cannot approve their own task submission');
    }

    const updated = await prisma.taskResponse.update({
      where: { id: response.id },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });

    await logAudit(
      req.user,
      decision === 'APPROVE' ? AUDIT.TASK_APPROVED : AUDIT.TASK_REJECTED,
      'TaskResponse',
      response.id,
      `${decision === 'APPROVE' ? 'Approved' : 'Rejected'} ${response.user.name}'s response to "${response.task.title}"`,
      { note }
    );

    res.json({ response: updated });
  })
);

router.patch(
  '/:id',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(3).optional(),
        description: z.string().nullish(),
        dueDate: z.string().nullish(),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
        isOpen: z.boolean().optional(),
      })
      .parse(req.body);

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { ...body, ...(body.dueDate ? { dueDate: new Date(body.dueDate) } : {}) },
    });
    res.json({ task });
  })
);

export default router;
