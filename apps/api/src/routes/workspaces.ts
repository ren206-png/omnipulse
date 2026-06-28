import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { notify } from '../lib/notify.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id

    const [owned, memberships] = await Promise.all([
      prisma.workspace.findMany({
        where: { ownerId: userId },
        include: { _count: { select: { posts: true, socialAccounts: true } } },
      }),
      prisma.workspaceMember.findMany({
        where: { userId },
        include: {
          workspace: {
            include: { _count: { select: { posts: true, socialAccounts: true } } },
          },
        },
      }),
    ])

    const memberWorkspaces = memberships.map((m) => ({
      ...m.workspace,
      memberRole: m.role,
    }))

    const ownedWithRole = owned.map((w) => ({ ...w, memberRole: 'OWNER' as const }))

    const seen = new Set(ownedWithRole.map((w) => w.id))
    let merged = [
      ...ownedWithRole,
      ...memberWorkspaces.filter((w) => !seen.has(w.id)),
    ]

    // Auto-provision a default workspace for users who have none
    if (merged.length === 0) {
      const created = await prisma.workspace.create({
        data: { name: 'My Workspace', ownerId: userId },
        include: { _count: { select: { posts: true, socialAccounts: true } } },
      })
      merged = [{ ...created, memberRole: 'OWNER' as const }]
      logger.info({ userId }, 'Auto-provisioned default workspace')
    }

    res.json({ workspaces: merged })
  } catch (err) {
    logger.error({ err }, 'List workspaces error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list workspaces')
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    sendError(res, 400, 'INVALID_NAME', 'Workspace name is required')
    return
  }

  try {
    const workspace = await prisma.workspace.create({
      data: { name: name.trim(), ownerId: req.user!.id },
    })
    logger.info({ workspaceId: workspace.id }, 'Workspace created')
    await notify({
      userId: req.user!.id,
      type: 'POST_PUBLISHED', // reuse closest type
      title: 'Workspace created 🎉',
      body: `Your workspace "${name.trim()}" is ready. Connect your social accounts to start scheduling.`,
      link: '/dashboard/accounts',
    })
    res.status(201).json({ workspace })
  } catch (err) {
    logger.error({ err }, 'Create workspace error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create workspace')
  }
})

export default router
