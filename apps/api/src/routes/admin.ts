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

// GET /api/v1/admin/platform-status — reports which OAuth env vars are configured
// Never returns actual secret values — only boolean configured/missing.
router.get('/platform-status', async (_req: Request, res: Response): Promise<void> => {
  const CALLBACK_URL = `${process.env.API_URL ?? 'https://api.getomnipulse.com'}/api/v1/social-accounts/oauth/callback`

  const platforms = [
    {
      id: 'LINKEDIN',
      name: 'LinkedIn',
      emoji: '💼',
      configured: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      vars: [
        { name: 'LINKEDIN_CLIENT_ID', set: !!process.env.LINKEDIN_CLIENT_ID },
        { name: 'LINKEDIN_CLIENT_SECRET', set: !!process.env.LINKEDIN_CLIENT_SECRET },
      ],
      devUrl: 'https://www.linkedin.com/developers/apps',
      scopes: 'openid, profile, email, w_member_social, w_organization_social',
      callbackUrl: CALLBACK_URL,
      notes: 'Create an app → Auth tab → add OAuth 2.0 redirect URL → request w_member_social + w_organization_social products',
    },
    {
      id: 'FACEBOOK',
      name: 'Facebook & Instagram',
      emoji: '📘',
      configured: !!(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
      vars: [
        { name: 'FACEBOOK_CLIENT_ID', set: !!process.env.FACEBOOK_CLIENT_ID },
        { name: 'FACEBOOK_CLIENT_SECRET', set: !!process.env.FACEBOOK_CLIENT_SECRET },
      ],
      devUrl: 'https://developers.facebook.com/apps',
      scopes: 'pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish',
      callbackUrl: CALLBACK_URL,
      notes: 'Create a Business app → Add Facebook Login product → Add redirect URI → Enable pages_manage_posts + instagram_content_publish permissions',
    },
    {
      id: 'X',
      name: 'X (Twitter)',
      emoji: '🐦',
      configured: !!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
      vars: [
        { name: 'X_CLIENT_ID', set: !!process.env.X_CLIENT_ID },
        { name: 'X_CLIENT_SECRET', set: !!process.env.X_CLIENT_SECRET },
      ],
      devUrl: 'https://developer.twitter.com/en/portal/projects-and-apps',
      scopes: 'tweet.read, tweet.write, users.read (OAuth 2.0 PKCE)',
      callbackUrl: CALLBACK_URL,
      notes: 'Create a project+app → User authentication settings → OAuth 2.0 → set callback URL → enable Read+Write permissions',
    },
    {
      id: 'TIKTOK',
      name: 'TikTok',
      emoji: '🎵',
      configured: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
      vars: [
        { name: 'TIKTOK_CLIENT_KEY', set: !!process.env.TIKTOK_CLIENT_KEY },
        { name: 'TIKTOK_CLIENT_SECRET', set: !!process.env.TIKTOK_CLIENT_SECRET },
      ],
      devUrl: 'https://developers.tiktok.com/apps',
      scopes: 'user.info.basic, video.upload',
      callbackUrl: CALLBACK_URL,
      notes: 'Create an app → Add Login Kit product → set redirect domain to api.getomnipulse.com → enable video.upload scope',
    },
    {
      id: 'GOOGLE',
      name: 'YouTube',
      emoji: '▶️',
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      vars: [
        { name: 'GOOGLE_CLIENT_ID', set: !!process.env.GOOGLE_CLIENT_ID },
        { name: 'GOOGLE_CLIENT_SECRET', set: !!process.env.GOOGLE_CLIENT_SECRET },
      ],
      devUrl: 'https://console.cloud.google.com/apis/credentials',
      scopes: 'https://www.googleapis.com/auth/youtube.upload',
      callbackUrl: CALLBACK_URL,
      notes: 'Create OAuth 2.0 Client ID (Web application) → add Authorised redirect URI → enable YouTube Data API v3',
    },
  ]

  const stripeConfigured = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  const stripeProPrice = !!process.env.STRIPE_PRO_PRICE_ID
  const stripeAgencyPrice = !!process.env.STRIPE_AGENCY_PRICE_ID

  res.json({
    callbackUrl: CALLBACK_URL,
    platforms,
    billing: {
      stripeConfigured,
      stripeProPriceId: stripeProPrice,
      stripeAgencyPriceId: stripeAgencyPrice,
      stripePublishableKey: !!process.env.STRIPE_PUBLISHABLE_KEY,
      dashboardUrl: 'https://dashboard.stripe.com/products',
    },
  })
})

export default router
