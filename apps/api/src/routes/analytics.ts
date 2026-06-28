import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { computeRecommendations } from '../lib/bestTimes.js'
import { syncAnalytics } from '../workers/analyticsSync.worker.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
      include: {
        snapshots: {
          orderBy: { recordedAt: 'asc' },
        },
      },
    })

    const data = accounts.map((account) => ({
      socialAccountId: account.id,
      platform: account.platform,
      externalProfileId: account.externalProfileId,
      snapshots: account.snapshots.map((s) => ({
        id: s.id,
        followers: s.followers,
        impressions: s.impressions,
        engagementRate: s.engagementRate,
        recordedAt: s.recordedAt,
      })),
    }))

    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'Analytics fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch analytics')
  }
})

router.get('/best-times', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: 'PUBLISHED' },
      select: { platforms: true, scheduledFor: true },
    })

    const hoursByPlatform: Record<string, number[]> = {}
    for (const post of posts) {
      const hour = new Date(post.scheduledFor).getUTCHours()
      for (const platform of post.platforms) {
        if (!hoursByPlatform[platform]) hoursByPlatform[platform] = []
        hoursByPlatform[platform].push(hour)
      }
    }

    // Always show all supported platforms; merge workspace data with benchmarks
    const ALL_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'TIKTOK']
    const platforms = Array.from(new Set([...ALL_PLATFORMS, ...Object.keys(hoursByPlatform)]))

    const recommendations = platforms.map((platform) =>
      computeRecommendations(platform, hoursByPlatform[platform] ?? []),
    )

    res.json({ recommendations })
  } catch (err) {
    logger.error({ err }, 'Best times fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to compute best times')
  }
})

// GET /api/v1/analytics/top-posts?workspaceId=&limit=10
router.get('/top-posts', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, limit = '10' } = req.query as { workspaceId?: string; limit?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const posts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId, status: 'PUBLISHED' },
      include: { metrics: true },
      orderBy: { scheduledFor: 'desc' },
      take: 50,
    })

    type AnyPost = { id: string; content: string; platforms: string[]; scheduledFor: Date; metrics: { platform: string; likes: number; comments: number; shares: number; reach: number }[] }
    const ranked = (posts as AnyPost[])
      .map((p) => {
        const totalEngagement = p.metrics.reduce((sum, m) => sum + m.likes + m.comments + m.shares, 0)
        const totalReach = p.metrics.reduce((sum, m) => sum + m.reach, 0)
        return { id: p.id, content: p.content, platforms: p.platforms, scheduledFor: p.scheduledFor, metrics: p.metrics, totalEngagement, totalReach }
      })
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, parseInt(limit, 10))

    res.json({ posts: ranked })
  } catch (err) {
    logger.error({ err }, 'Top posts fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch top posts')
  }
})

// POST /api/v1/analytics/sync?workspaceId=xxx — trigger an immediate analytics sync
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }

  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }
  }

  // Run async — don't await so the response is immediate
  syncAnalytics(workspaceId).catch((err) => logger.error({ err }, 'Manual analytics sync error'))

  res.json({ message: 'Sync started' })
})

export default router
