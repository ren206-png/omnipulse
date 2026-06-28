import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/competitors?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const competitors = await (prisma.competitorAccount.findMany as Function)({
      where: { workspaceId },
      include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 30 } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ competitors })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// POST /api/v1/competitors — add competitor
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, platform, handle, displayName } = req.body
  if (!workspaceId || !platform || !handle) { sendError(res, 400, 'MISSING_FIELDS', 'workspaceId, platform, handle required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const competitor = await (prisma.competitorAccount.create as Function)({
      data: { workspaceId, platform, handle: handle.replace('@', ''), displayName: displayName ?? handle },
    })
    // Seed an initial snapshot with simulated data
    await (prisma.competitorSnapshot.create as Function)({
      data: {
        competitorAccountId: competitor.id,
        followers: Math.floor(Math.random() * 50000) + 1000,
        estimatedEngagement: parseFloat((Math.random() * 5 + 0.5).toFixed(2)),
      },
    })
    res.status(201).json({ competitor })
  } catch (err: any) {
    if (err?.code === 'P2002') { sendError(res, 409, 'DUPLICATE', 'Competitor already tracked'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add competitor')
  }
})

// POST /api/v1/competitors/:id/snapshot — manually refresh data
router.post('/:id/snapshot', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const competitor = await (prisma.competitorAccount.findUnique as Function)({ where: { id }, include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 1 } } })
    if (!competitor) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: competitor.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    // Simulate slight growth from last snapshot
    const last = competitor.snapshots[0]
    const prevFollowers = last?.followers ?? 10000
    const growth = Math.floor(Math.random() * 200) - 50 // -50 to +150
    const snapshot = await (prisma.competitorSnapshot.create as Function)({
      data: {
        competitorAccountId: id,
        followers: Math.max(0, prevFollowers + growth),
        estimatedEngagement: parseFloat((Math.random() * 5 + 0.5).toFixed(2)),
      },
    })
    res.json({ snapshot })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// DELETE /api/v1/competitors/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const competitor = await (prisma.competitorAccount.findUnique as Function)({ where: { id } })
    if (!competitor) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: competitor.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await (prisma.competitorAccount.delete as Function)({ where: { id } })
    res.json({ message: 'Removed' })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

export default router
