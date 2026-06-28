import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { publishPostQueue } from '../lib/queue.js'
import { computeRecommendations } from '../lib/bestTimes.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const

router.use(requireAuth)

async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return 'OWNER'

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return (membership?.role as 'ADMIN' | 'MEMBER') ?? null
}

// GET /api/v1/queue?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    const posts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId, status: 'QUEUED' },
      orderBy: { queuePosition: 'asc' },
    })
    res.json({ posts })
  } catch (err) {
    logger.error({ err }, 'List queue error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list queue')
  }
})

// POST /api/v1/queue
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, content, platforms, mediaUrls } = req.body as {
    workspaceId?: string
    content?: string
    platforms?: string[]
    mediaUrls?: string[]
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!content || content.trim().length === 0) { sendError(res, 400, 'MISSING_FIELD', 'content is required'); return }
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'platforms array is required'); return }

  const invalidPlatforms = platforms.filter((p) => !VALID_PLATFORMS.includes(p as typeof VALID_PLATFORMS[number]))
  if (invalidPlatforms.length > 0) { sendError(res, 400, 'INVALID_PLATFORM', `Invalid platforms: ${invalidPlatforms.join(', ')}`); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    // Find max queuePosition for this workspace
    const maxResult = await (prisma.scheduledPost.aggregate as Function)({
      where: { workspaceId, status: 'QUEUED' },
      _max: { queuePosition: true },
    })
    const nextPosition = ((maxResult._max?.queuePosition as number | null) ?? 0) + 1

    const post = await (prisma.scheduledPost.create as Function)({
      data: {
        workspaceId,
        content: content.trim(),
        mediaUrls: mediaUrls ?? [],
        platforms: platforms as (typeof VALID_PLATFORMS[number])[],
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // placeholder; will be set on dispatch
        status: 'QUEUED',
        queuePosition: nextPosition,
        submittedBy: req.user!.id,
      },
    })

    logger.info({ postId: post.id, queuePosition: nextPosition }, 'Post added to queue')
    res.status(201).json({ post })
  } catch (err) {
    logger.error({ err }, 'Add to queue error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add post to queue')
  }
})

// PATCH /api/v1/queue/reorder
router.patch('/reorder', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, orderedIds } = req.body as { workspaceId?: string; orderedIds?: string[] }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'orderedIds array is required'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        (prisma.scheduledPost.update as Function)({
          where: { id },
          data: { queuePosition: index + 1 },
        }),
      ),
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, 'Reorder queue error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reorder queue')
  }
})

// PATCH /api/v1/queue/:id/dispatch
router.patch('/:id/dispatch', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    if (post.status !== 'QUEUED') {
      sendError(res, 400, 'INVALID_STATUS', 'Only QUEUED posts can be dispatched')
      return
    }

    // Get published hours for this workspace to compute best time
    const publishedPosts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId: post.workspaceId, status: 'PUBLISHED' },
      select: { scheduledFor: true },
    })
    const publishedHours: number[] = (publishedPosts as Array<{ scheduledFor: Date }>).map((p) => p.scheduledFor.getHours())

    // Use first platform to get recommendation
    const firstPlatform = (post.platforms as string[])[0] ?? 'INSTAGRAM'
    const recommendation = computeRecommendations(firstPlatform, publishedHours)
    const bestHour = recommendation.topHours[0] ?? 9

    // Find next occurrence of that hour (today or tomorrow)
    const now = new Date()
    const candidate = new Date(now)
    candidate.setHours(bestHour, 0, 0, 0)

    if (candidate.getTime() <= now.getTime()) {
      // Hour already passed today — use tomorrow
      candidate.setDate(candidate.getDate() + 1)
    }

    const delay = candidate.getTime() - Date.now()

    const updated = await (prisma.scheduledPost.update as Function)({
      where: { id },
      data: {
        status: 'SCHEDULED',
        scheduledFor: candidate,
        queuePosition: null,
      },
    })

    const job = await publishPostQueue.add(
      'publish-post',
      { postId: id },
      { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    )

    logger.info({ postId: id, jobId: job.id, scheduledFor: candidate }, 'Queue post dispatched')
    res.json({ post: updated, jobId: job.id, scheduledFor: candidate })
  } catch (err) {
    logger.error({ err }, 'Dispatch queue post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to dispatch post')
  }
})

// DELETE /api/v1/queue/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    await prisma.scheduledPost.delete({ where: { id } })
    logger.info({ postId: id }, 'Queue post deleted')
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete queue post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete post')
  }
})

export default router
