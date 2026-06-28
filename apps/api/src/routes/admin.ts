import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { env } from '../config/env.js'

const router = Router()

// All admin routes require auth + must be the ADMIN_EMAIL
function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!env.ADMIN_EMAIL) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
  if (!req.user?.email || req.user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied')
    return
  }
  next()
}

router.use(requireAuth)
router.use(requireAdmin as unknown as (req: Request, res: Response, next: () => void) => void)

// GET /api/v1/admin/stats — platform-wide numbers
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      totalWorkspaces,
      totalPosts,
      totalPublished,
      planCounts,
      recentUsers,
      activeWorkspaces,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.scheduledPost.count(),
      prisma.scheduledPost.count({ where: { status: 'PUBLISHED' } }),
      prisma.workspace.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, email: true, createdAt: true, workspaces: { select: { id: true, name: true, plan: true } } },
      }),
      // Workspaces that have published at least one post in the last 7 days
      prisma.workspace.count({
        where: {
          posts: { some: { status: 'PUBLISHED', scheduledFor: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        },
      }),
    ])

    const plans: Record<string, number> = {}
    for (const row of planCounts) {
      plans[row.plan] = row._count._all
    }

    res.json({
      totals: { users: totalUsers, workspaces: totalWorkspaces, posts: totalPosts, published: totalPublished },
      activeWorkspacesLast7Days: activeWorkspaces,
      plans,
      recentUsers,
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load stats')
  }
})

// GET /api/v1/admin/users?page=1&limit=50&search= — paginated user list
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  const { search, page = '1', limit = '50' } = req.query as Record<string, string>
  const pageNum = Math.max(1, parseInt(page, 10))
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)))
  const skip = (pageNum - 1) * limitNum

  try {
    const where = search?.trim()
      ? { email: { contains: search.trim(), mode: 'insensitive' as const } }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          email: true,
          createdAt: true,
          workspaces: {
            select: {
              id: true,
              name: true,
              plan: true,
              stripeSubscriptionId: true,
              subscriptionStatus: true,
              _count: { select: { posts: true, socialAccounts: true } },
            },
          },
          _count: { select: { workspaces: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    res.json({ users, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load users')
  }
})

export default router
