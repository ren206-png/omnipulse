import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()

const db = prisma as any

// GET — fetch portal status for a workspace
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId: string }
  if (!workspaceId) { sendError(res, 400, 'BAD_REQUEST', 'workspaceId required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const portal = await db.clientPortal.findUnique({ where: { workspaceId } })
    res.json({ portal: portal ?? null })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// POST — create or update portal
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, clientName, clientEmail } = req.body
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const portal = await db.clientPortal.upsert({
      where: { workspaceId },
      create: { workspaceId, clientName, clientEmail },
      update: { clientName, clientEmail, active: true },
    })
    res.json({ portal })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// PATCH — update clientName, clientEmail, active
router.patch('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, clientName, clientEmail, active } = req.body
  if (!workspaceId) { sendError(res, 400, 'BAD_REQUEST', 'workspaceId required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const data: any = {}
    if (clientName !== undefined) data.clientName = clientName
    if (clientEmail !== undefined) data.clientEmail = clientEmail
    if (active !== undefined) data.active = active
    const portal = await db.clientPortal.update({ where: { workspaceId }, data })
    res.json({ portal })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// DELETE — disable portal
router.delete('/:workspaceId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await db.clientPortal.update({ where: { workspaceId }, data: { active: false } })
    res.json({ message: 'Portal disabled' })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// Public route — view portal by token
router.get('/view/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  try {
    const portal = await db.clientPortal.findUnique({
      where: { token },
      include: {
        workspace: {
          include: {
            socialAccounts: { include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 5 } } },
            posts: { where: { status: { in: ['PUBLISHED', 'SCHEDULED'] } }, orderBy: { scheduledFor: 'desc' }, take: 20 },
          },
        },
      },
    })
    if (!portal || !portal.active) { sendError(res, 404, 'NOT_FOUND', 'Portal not found or inactive'); return }
    res.json({
      clientName: portal.clientName,
      workspace: {
        name: portal.workspace.brandName ?? portal.workspace.name,
        plan: portal.workspace.plan,
        accounts: portal.workspace.socialAccounts.map((a: any) => ({ platform: a.platform, externalProfileId: a.externalProfileId, latestSnapshot: a.snapshots[0] ?? null })),
        recentPosts: portal.workspace.posts,
      },
    })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

export default router
