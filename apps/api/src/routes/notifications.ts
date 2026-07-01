import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { sseSubscribers } from '../lib/sseRegistry.js'

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

// GET /api/v1/notifications/stream — SSE endpoint for real-time notifications
// This route patches req.headers.authorization from query param before requireAuth runs,
// because EventSource cannot send custom headers.
router.get(
  '/stream',
  (req: Request, _res: Response, next: () => void) => {
    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token as string}`
    }
    next()
  },
  requireAuth,
  (req: Request, res: Response): void => {
    const userId = req.user!.id

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    res.flushHeaders()

    // Send initial heartbeat
    res.write('event: connected\ndata: {"ok":true}\n\n')

    // Register subscriber
    if (!sseSubscribers.has(userId)) sseSubscribers.set(userId, new Set())
    sseSubscribers.get(userId)!.add(res)

    // Heartbeat every 25s to keep connection alive through proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(':heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25_000)

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat)
      sseSubscribers.get(userId)?.delete(res)
      if (sseSubscribers.get(userId)?.size === 0) sseSubscribers.delete(userId)
    })
  },
)

// GET /api/v1/notifications/preferences - return default preferences (client stores overrides in localStorage)
router.get('/preferences', requireAuth, (req: Request, res: Response): void => {
  res.json({
    preferences: {
      postPublished: true,
      postFailed: true,
      postPendingReview: true,
      approvalDecision: true,
      engagementAlert: true,
      followerMilestone: true,
      weeklyDigest: true,
      teamMemberJoined: true,
      mentionInComment: true,
    },
  })
})

// POST /api/v1/notifications/preferences - acknowledge preference save (future backend storage)
router.post('/preferences', requireAuth, (req: Request, res: Response): void => {
  res.json({ ok: true })
})

export default router
