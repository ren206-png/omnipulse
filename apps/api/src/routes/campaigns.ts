import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

async function checkCampaignAccess(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ])
  return !!(ws && (ws.ownerId === userId || member))
}

// GET /api/v1/campaigns?workspaceId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkCampaignAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const campaigns = await (prisma as any).campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { posts: true } } },
    })
    res.json({ campaigns })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch campaigns')
  }
})

// POST /api/v1/campaigns
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, name, color } = req.body as { workspaceId?: string; name?: string; color?: string }
  if (!workspaceId || !name?.trim()) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and name required'); return }
  if (!await checkCampaignAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const campaign = await (prisma as any).campaign.create({
      data: { workspaceId, name: name.trim(), color: color ?? '#6366f1' },
    })
    res.status(201).json({ campaign })
  } catch (err: any) {
    if (err?.code === 'P2002') { sendError(res, 409, 'CONFLICT', 'A campaign with this name already exists'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create campaign')
  }
})

// PATCH /api/v1/campaigns/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { name, color } = req.body as { name?: string; color?: string }
  try {
    const existing = await (prisma as any).campaign.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing) { sendError(res, 404, 'NOT_FOUND', 'Campaign not found'); return }
    if (!await checkCampaignAccess(existing.workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const campaign = await (prisma as any).campaign.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(color && { color }),
      },
    })
    res.json({ campaign })
  } catch (err: any) {
    if (err?.code === 'P2025') { sendError(res, 404, 'NOT_FOUND', 'Campaign not found'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update campaign')
  }
})

// DELETE /api/v1/campaigns/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const existing = await (prisma as any).campaign.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!existing) { sendError(res, 404, 'NOT_FOUND', 'Campaign not found'); return }
    if (!await checkCampaignAccess(existing.workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await (prisma as any).campaign.delete({ where: { id } })
    res.json({ success: true })
  } catch (err: any) {
    if (err?.code === 'P2025') { sendError(res, 404, 'NOT_FOUND', 'Campaign not found'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete campaign')
  }
})

export default router
