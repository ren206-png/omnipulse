import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()

// Authenticated routes — manage portal
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, clientName, clientEmail } = req.body
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const portal = await (prisma.clientPortal.upsert as Function)({
      where: { workspaceId },
      create: { workspaceId, clientName, clientEmail },
      update: { clientName, clientEmail, active: true },
    })
    res.json({ portal })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

router.delete('/:workspaceId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await (prisma.clientPortal.update as Function)({ where: { workspaceId }, data: { active: false } })
    res.json({ message: 'Portal disabled' })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// Public route — view portal by token
router.get('/view/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  try {
    const portal = await (prisma.clientPortal.findUnique as Function)({
      where: { token },
      include: { workspace: { include: { socialAccounts: { include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 5 } } }, posts: { where: { status: { in: ['PUBLISHED', 'SCHEDULED'] } }, orderBy: { scheduledFor: 'desc' }, take: 20 } } } },
    })
    if (!portal || !portal.active) { sendError(res, 404, 'NOT_FOUND', 'Portal not found or inactive'); return }
    res.json({
      clientName: portal.clientName,
      workspace: {
        name: portal.workspace.brandName ?? portal.workspace.name,
        plan: portal.workspace.plan,
        accounts: portal.workspace.socialAccounts.map((a: any) => ({ platform: a.platform, externalProfileId: a.externalProfileId, latestSnapshot: a.snapshots[0] ?? null })),
        recentPosts: portal.workspace.posts,
      }
    })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

export default router
