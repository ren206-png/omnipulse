import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

const MOCK_MESSAGES = [
  { authorName: 'Sarah Chen', authorHandle: '@sarahchen', content: 'Love this post! Can you share more about your process? 🔥', type: 'COMMENT' as const, platform: 'INSTAGRAM' as const },
  { authorName: 'Marcus Webb', authorHandle: '@marcuswebb', content: 'This is exactly what I needed to see today. Sharing with my team!', type: 'COMMENT' as const, platform: 'FACEBOOK' as const },
  { authorName: 'TechBlog Daily', authorHandle: '@techblogdaily', content: 'Great insights @yourbrand — we featured you in our newsletter!', type: 'MENTION' as const, platform: 'X' as const },
  { authorName: 'Priya Sharma', authorHandle: '@priyasharma_', content: 'Question: do you offer a free trial? Would love to try this out', type: 'DM' as const, platform: 'INSTAGRAM' as const },
  { authorName: 'Jordan Lee', authorHandle: '@jordanlee', content: 'Been following for months — your content just keeps getting better 🙌', type: 'COMMENT' as const, platform: 'TIKTOK' as const },
  { authorName: 'Alex Rivera', authorHandle: '@alexrivera', content: 'Just discovered your page and already learned so much. New follower!', type: 'COMMENT' as const, platform: 'INSTAGRAM' as const },
  { authorName: 'Startup Weekly', authorHandle: '@startupweekly', content: 'Mentioned you in our latest roundup of tools every founder needs', type: 'MENTION' as const, platform: 'X' as const },
  { authorName: 'Emma Johnson', authorHandle: null, content: 'Hi, I have a question about pricing. Can we chat?', type: 'DM' as const, platform: 'FACEBOOK' as const },
  { authorName: 'Ryan Park', authorHandle: '@ryanpark', content: 'This changed how I think about social media. Mind blown 🤯', type: 'COMMENT' as const, platform: 'X' as const },
  { authorName: 'Olivia Kim', authorHandle: '@oliviakim', content: 'Do you do brand collaborations? Would love to work together!', type: 'DM' as const, platform: 'INSTAGRAM' as const },
]

// GET /api/v1/inbox?workspaceId=&status=UNREAD&type=&limit=50
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, status, type, limit = '50' } = req.query as {
    workspaceId?: string
    status?: string
    type?: string
    limit?: string
  }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_PARAM', 'workspaceId is required')
    return
  }

  try {
    // Verify workspace ownership/membership
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
    })

    if (!workspace) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const where: Record<string, unknown> = { workspaceId }
    if (status) where.status = status
    if (type) where.type = type

    const [messages, unreadCount] = await Promise.all([
      prisma.inboxMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 50, 200),
      }),
      prisma.inboxMessage.count({
        where: { workspaceId, status: 'UNREAD' },
      }),
    ])

    res.json({ messages, unreadCount })
  } catch (err) {
    logger.error({ err }, 'List inbox messages error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list inbox messages')
  }
})

// POST /api/v1/inbox/seed?workspaceId= — dev/demo only, blocked in production
router.post('/seed', async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    sendError(res, 403, 'FORBIDDEN', 'Seed endpoint is not available in production')
    return
  }

  const { workspaceId } = req.query as { workspaceId?: string }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_PARAM', 'workspaceId is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
      include: { socialAccounts: true },
    })

    if (!workspace) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    if (workspace.socialAccounts.length === 0) {
      res.status(400).json({
        error: 'No social accounts connected. Connect a social account first to seed demo messages.',
        code: 'NO_SOCIAL_ACCOUNTS',
      })
      return
    }

    // Build a map of platform -> socialAccountId for matching
    const platformMap = new Map<string, string>()
    for (const acct of workspace.socialAccounts) {
      platformMap.set(acct.platform, acct.id)
    }

    // Round-robin fallback
    const accountIds = workspace.socialAccounts.map((a) => a.id)
    let rrIdx = 0

    const records = MOCK_MESSAGES.map((msg, i) => {
      const socialAccountId = platformMap.get(msg.platform) ?? accountIds[rrIdx++ % accountIds.length]
      return {
        workspaceId,
        socialAccountId,
        platform: msg.platform,
        externalId: `seed-${workspaceId}-${i}-${Date.now()}`,
        authorName: msg.authorName,
        authorHandle: msg.authorHandle,
        content: msg.content,
        type: msg.type,
        status: 'UNREAD' as const,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 30), // 30 min apart
      }
    })

    const created = await prisma.inboxMessage.createMany({
      data: records,
      skipDuplicates: true,
    })

    res.json({ seeded: created.count })
  } catch (err) {
    logger.error({ err }, 'Seed inbox error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to seed inbox messages')
  }
})

// PATCH /api/v1/inbox/:id/read
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const msg = await prisma.inboxMessage.findUnique({ where: { id } })
    if (!msg) { sendError(res, 404, 'NOT_FOUND', 'Message not found'); return }

    // Verify workspace access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: msg.workspaceId,
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
    })
    if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const updated = await prisma.inboxMessage.update({
      where: { id },
      data: { status: 'READ' },
    })
    res.json({ message: updated })
  } catch (err) {
    logger.error({ err }, 'Mark inbox read error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark message as read')
  }
})

// PATCH /api/v1/inbox/:id/reply
router.patch('/:id/reply', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { reply } = req.body as { reply?: string }

  if (!reply || !reply.trim()) {
    sendError(res, 400, 'MISSING_PARAM', 'reply text is required')
    return
  }

  try {
    const msg = await prisma.inboxMessage.findUnique({ where: { id } })
    if (!msg) { sendError(res, 404, 'NOT_FOUND', 'Message not found'); return }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: msg.workspaceId,
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
    })
    if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const updated = await prisma.inboxMessage.update({
      where: { id },
      data: { reply: reply.trim(), repliedAt: new Date(), status: 'REPLIED' },
    })
    res.json({ message: updated })
  } catch (err) {
    logger.error({ err }, 'Reply inbox error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to save reply')
  }
})

// PATCH /api/v1/inbox/:id/dismiss
router.patch('/:id/dismiss', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const msg = await prisma.inboxMessage.findUnique({ where: { id } })
    if (!msg) { sendError(res, 404, 'NOT_FOUND', 'Message not found'); return }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: msg.workspaceId,
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } },
        ],
      },
    })
    if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const updated = await prisma.inboxMessage.update({
      where: { id },
      data: { status: 'DISMISSED' },
    })
    res.json({ message: updated })
  } catch (err) {
    logger.error({ err }, 'Dismiss inbox error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to dismiss message')
  }
})

export default router
