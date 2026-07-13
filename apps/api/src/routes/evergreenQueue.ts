/**
 * Evergreen Queue routes
 * POST   /api/v1/evergreen/:postId/enqueue   — add post to evergreen queue
 * DELETE /api/v1/evergreen/:postId/dequeue   — remove from queue (sets active=false)
 * PATCH  /api/v1/evergreen/:postId/settings  — update settings
 * GET    /api/v1/evergreen                   — list queue entries for workspace
 */
import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { FF_EVERGREEN_QUEUE } from '../lib/featureFlags.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

// FF guard — all routes return 404 if feature flag is off
router.use((_req: Request, res: Response, next: () => void) => {
  if (!FF_EVERGREEN_QUEUE) {
    sendError(res, 404, 'NOT_FOUND', 'Not found')
    return
  }
  next()
})

// MM-DD format validation
const MD_REGEX = /^\d{2}-\d{2}$/

/**
 * Verify the requesting user is an owner or admin of the given workspace.
 */
async function checkOwnerOrAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    }),
  ])
  if (!ws) return false
  if (ws.ownerId === userId) return true
  if (member && (member.role === 'OWNER' || member.role === 'ADMIN')) return true
  return false
}

// GET /api/v1/evergreen?workspaceId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkOwnerOrAdmin(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }
  try {
    const entries = await (prisma as any).evergreenQueue.findMany({
      where: { workspaceId },
      include: {
        post: {
          select: { id: true, content: true, platforms: true, status: true, scheduledFor: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ entries })
  } catch (err) {
    logger.error({ err }, '[EvergreenQueue] List error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list evergreen queue')
  }
})

// POST /api/v1/evergreen/:postId/enqueue
router.post('/:postId/enqueue', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId } = req.body as { workspaceId?: string }

  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkOwnerOrAdmin(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    // Validate post exists and belongs to this workspace
    const post = await prisma.scheduledPost.findUnique({
      where: { id: postId },
      select: { id: true, workspaceId: true, status: true },
    })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }
    if (post.workspaceId !== workspaceId) { sendError(res, 403, 'FORBIDDEN', 'Post does not belong to this workspace'); return }
    if (post.status !== 'PUBLISHED') {
      sendError(res, 422, 'VALIDATION_ERROR', 'Only published posts can be added to the evergreen queue'); return
    }

    // Check DLQ — refuse if post has unresolved DLQ entry
    const dlqEntry = await (prisma as any).postDlq.findFirst({
      where: { postId, resolvedAt: null },
    })
    if (dlqEntry) {
      sendError(res, 422, 'VALIDATION_ERROR', 'Post has an unresolved DLQ entry and cannot be enqueued'); return
    }

    // Upsert — reactivate if previously dequeued
    const entry = await (prisma as any).evergreenQueue.upsert({
      where: { postId },
      create: { workspaceId, postId },
      update: { active: true },
    })

    res.status(201).json({ entry })
  } catch (err) {
    logger.error({ err }, '[EvergreenQueue] Enqueue error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to enqueue post')
  }
})

// DELETE /api/v1/evergreen/:postId/dequeue
router.delete('/:postId/dequeue', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  try {
    const entry = await (prisma as any).evergreenQueue.findUnique({
      where: { postId },
      select: { id: true, workspaceId: true },
    })
    if (!entry) { sendError(res, 404, 'NOT_FOUND', 'Evergreen queue entry not found'); return }
    if (!await checkOwnerOrAdmin(entry.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await (prisma as any).evergreenQueue.update({
      where: { postId },
      data: { active: false },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, '[EvergreenQueue] Dequeue error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to dequeue post')
  }
})

// PATCH /api/v1/evergreen/:postId/settings
router.patch('/:postId/settings', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const body = req.body as {
    minIntervalDays?: number
    autoPublish?: boolean
    confirmAutoPublish?: boolean
    seasonalExclusions?: Array<{ startMD: string; endMD: string; label: string }>
  }

  try {
    const entry = await (prisma as any).evergreenQueue.findUnique({
      where: { postId },
      select: { id: true, workspaceId: true },
    })
    if (!entry) { sendError(res, 404, 'NOT_FOUND', 'Evergreen queue entry not found'); return }
    if (!await checkOwnerOrAdmin(entry.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const update: Record<string, unknown> = {}

    // Validate minIntervalDays
    if (body.minIntervalDays !== undefined) {
      const v = Number(body.minIntervalDays)
      if (!Number.isInteger(v) || v < 7 || v > 365) {
        sendError(res, 400, 'VALIDATION_ERROR', 'minIntervalDays must be an integer between 7 and 365'); return
      }
      update.minIntervalDays = v
    }

    // Validate autoPublish — require explicit confirmation
    if (body.autoPublish !== undefined) {
      if (typeof body.autoPublish !== 'boolean') {
        sendError(res, 400, 'VALIDATION_ERROR', 'autoPublish must be a boolean'); return
      }
      if (body.autoPublish === true && body.confirmAutoPublish !== true) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Enabling autoPublish requires confirmAutoPublish: true in the request body'); return
      }
      update.autoPublish = body.autoPublish
    }

    // Validate seasonalExclusions
    if (body.seasonalExclusions !== undefined) {
      if (!Array.isArray(body.seasonalExclusions)) {
        sendError(res, 400, 'VALIDATION_ERROR', 'seasonalExclusions must be an array'); return
      }
      if (body.seasonalExclusions.length > 10) {
        sendError(res, 400, 'VALIDATION_ERROR', 'seasonalExclusions may contain at most 10 entries'); return
      }
      for (const exc of body.seasonalExclusions) {
        if (!MD_REGEX.test(exc.startMD) || !MD_REGEX.test(exc.endMD)) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Each seasonalExclusion startMD and endMD must match MM-DD format'); return
        }
        if (typeof exc.label !== 'string' || exc.label.length > 50) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Each seasonalExclusion label must be a string of at most 50 characters'); return
        }
      }
      update.seasonalExclusions = body.seasonalExclusions
    }

    if (Object.keys(update).length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'No valid fields to update'); return
    }

    const updated = await (prisma as any).evergreenQueue.update({
      where: { postId },
      data: update,
    })

    res.json({ entry: updated })
  } catch (err) {
    logger.error({ err }, '[EvergreenQueue] Settings update error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update settings')
  }
})

export default router
