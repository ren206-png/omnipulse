import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/notifications?unreadOnly=true&limit=20
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { unreadOnly, limit = '30' } = req.query as { unreadOnly?: string; limit?: string }
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user!.id,
        ...(unreadOnly === 'true' ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 30, 100),
    })
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, read: false },
    })
    res.json({ notifications, unreadCount })
  } catch (err) {
    logger.error({ err }, 'List notifications error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list notifications')
  }
})

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { read: true },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Mark read error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark notification as read')
  }
})

// POST /api/v1/notifications/read-all
router.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    })
    res.json({ marked: count })
  } catch (err) {
    logger.error({ err }, 'Mark all read error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark all as read')
  }
})

// DELETE /api/v1/notifications/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    await prisma.notification.deleteMany({ where: { id, userId: req.user!.id } })
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete notification error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete notification')
  }
})

export default router
