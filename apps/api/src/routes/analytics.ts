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
    const ALL_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'TIKTOK', 'LINKEDIN']
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

// GET /api/v1/analytics/insights?workspaceId=&days=30
// Returns aggregated content performance insights
router.get('/insights', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, days = '30' } = req.query as { workspaceId?: string; days?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

    const daysNum = Math.min(Math.max(parseInt(days, 10) || 30, 7), 365)
    const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000)

    const posts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId, status: 'PUBLISHED', scheduledFor: { gte: since } },
      include: { metrics: true },
      orderBy: { scheduledFor: 'desc' },
    })

    type Post = {
      id: string; content: string; platforms: string[]; scheduledFor: Date
      metrics: { platform: string; likes: number; comments: number; shares: number; reach: number }[]
    }

    const typedPosts = posts as Post[]

    // Overall totals
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalReach = 0
    for (const p of typedPosts) {
      for (const m of p.metrics) {
        totalLikes += m.likes; totalComments += m.comments; totalShares += m.shares; totalReach += m.reach
      }
    }

    // Platform breakdown
    const byPlatform: Record<string, { posts: number; likes: number; comments: number; shares: number; reach: number }> = {}
    for (const p of typedPosts) {
      for (const platform of p.platforms) {
        if (!byPlatform[platform]) byPlatform[platform] = { posts: 0, likes: 0, comments: 0, shares: 0, reach: 0 }
        byPlatform[platform].posts++
        const m = p.metrics.find((x) => x.platform === platform)
        if (m) {
          byPlatform[platform].likes += m.likes
          byPlatform[platform].comments += m.comments
          byPlatform[platform].shares += m.shares
          byPlatform[platform].reach += m.reach
        }
      }
    }

    // Content length buckets: short (<100), medium (100-280), long (>280)
    const buckets = { short: { count: 0, engagement: 0 }, medium: { count: 0, engagement: 0 }, long: { count: 0, engagement: 0 } }
    for (const p of typedPosts) {
      const eng = p.metrics.reduce((sum, m) => sum + m.likes + m.comments + m.shares, 0)
      const bucket = p.content.length < 100 ? 'short' : p.content.length <= 280 ? 'medium' : 'long'
      buckets[bucket].count++
      buckets[bucket].engagement += eng
    }
    const contentLength = Object.entries(buckets).map(([label, { count, engagement }]) => ({
      label: label === 'short' ? 'Short (<100 chars)' : label === 'medium' ? 'Medium (100-280)' : 'Long (>280)',
      count,
      avgEngagement: count > 0 ? Math.round(engagement / count) : 0,
    }))

    // Top 5 posts by engagement
    const topPosts = typedPosts
      .map((p) => ({
        id: p.id,
        content: p.content.slice(0, 120) + (p.content.length > 120 ? '…' : ''),
        platforms: p.platforms,
        scheduledFor: p.scheduledFor,
        engagement: p.metrics.reduce((sum, m) => sum + m.likes + m.comments + m.shares, 0),
        reach: p.metrics.reduce((sum, m) => sum + m.reach, 0),
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5)

    // Posts per day (for sparkline / trend)
    const byDay: Record<string, number> = {}
    for (const p of typedPosts) {
      const day = p.scheduledFor.toISOString().slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + 1
    }
    const postTrend = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))

    res.json({
      period: { days: daysNum, since },
      summary: { totalPosts: typedPosts.length, totalLikes, totalComments, totalShares, totalReach },
      platformBreakdown: Object.entries(byPlatform).map(([platform, stats]) => ({ platform, ...stats })),
      contentLength,
      topPosts,
      postTrend,
    })
  } catch (err) {
    logger.error({ err }, 'Insights fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch insights')
  }
})

// GET /api/v1/analytics/platform-comparison
router.get('/platform-comparison', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, days = '30' } = req.query as { workspaceId?: string; days?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }

  const since = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000)

  const metrics = await (prisma as any).postMetric.findMany({
    where: {
      post: { workspaceId, status: 'PUBLISHED', scheduledFor: { gte: since } },
    },
    select: { platform: true, likes: true, comments: true, shares: true, reach: true },
  })

  const byPlatform: Record<string, { likes: number; comments: number; shares: number; reach: number; count: number }> = {}
  for (const m of metrics) {
    if (!byPlatform[m.platform]) byPlatform[m.platform] = { likes: 0, comments: 0, shares: 0, reach: 0, count: 0 }
    byPlatform[m.platform].likes += m.likes
    byPlatform[m.platform].comments += m.comments
    byPlatform[m.platform].shares += m.shares
    byPlatform[m.platform].reach += m.reach
    byPlatform[m.platform].count++
  }

  const comparison = Object.entries(byPlatform).map(([platform, s]) => ({
    platform,
    posts: s.count,
    totalEngagement: s.likes + s.comments + s.shares,
    avgEngagement: s.count > 0 ? Math.round((s.likes + s.comments + s.shares) / s.count) : 0,
    avgReach: s.count > 0 ? Math.round(s.reach / s.count) : 0,
    likes: s.likes, comments: s.comments, shares: s.shares,
  })).sort((a, b) => b.avgEngagement - a.avgEngagement)

  const best = comparison[0]?.platform ?? null
  const insight = best
    ? `Your ${best} posts get the most engagement on average. Consider posting there more frequently.`
    : 'Publish posts across multiple platforms to unlock comparison insights.'

  res.json({ comparison, insight, days: parseInt(days, 10) })
})

export default router
