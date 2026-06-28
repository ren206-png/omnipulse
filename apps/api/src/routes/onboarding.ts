import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/onboarding?workspaceId=xxx
// Returns checklist step completion derived from real workspace data.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: { select: { socialAccounts: true, posts: true, members: true } },
      },
    })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Not found'); return
    }

    const hasPublishedPost = await prisma.scheduledPost.count({
      where: { workspaceId, status: 'PUBLISHED' },
    }) > 0

    const steps = [
      {
        id: 'connect_account',
        label: 'Connect a social account',
        description: 'Link Instagram, X, LinkedIn, or TikTok to start publishing.',
        href: '/dashboard/accounts',
        done: workspace._count.socialAccounts > 0,
      },
      {
        id: 'create_post',
        label: 'Create your first post',
        description: 'Draft or schedule content from the calendar.',
        href: '/dashboard/calendar',
        done: workspace._count.posts > 0,
      },
      {
        id: 'publish_post',
        label: 'Publish a post',
        description: 'See your content go live on a connected platform.',
        href: '/dashboard/history',
        done: hasPublishedPost,
      },
      {
        id: 'invite_team',
        label: 'Invite a team member',
        description: 'Collaborate with your team on content creation.',
        href: '/dashboard/settings',
        done: workspace._count.members > 1,
        skipForFree: false,
      },
    ]

    res.json({
      dismissed: workspace.onboardingComplete,
      steps,
      completedCount: steps.filter((s) => s.done).length,
      totalCount: steps.length,
    })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load onboarding')
  }
})

// POST /api/v1/onboarding/dismiss?workspaceId=xxx
router.post('/dismiss', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Not found'); return
    }
    await prisma.workspace.update({ where: { id: workspaceId }, data: { onboardingComplete: true } })
    res.json({ dismissed: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to dismiss onboarding')
  }
})

export default router
