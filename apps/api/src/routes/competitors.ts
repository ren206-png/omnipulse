import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

const db = prisma as any

// GET /api/v1/competitors?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const competitors = await db.competitorAccount.findMany({
      where: { workspaceId },
      include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 30 } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ competitors })
  } catch (err) {
    logger.error({ err }, 'List competitors error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

// POST /api/v1/competitors — add competitor
// Body: { workspaceId, platform, handle, displayName?, followers?, engagementRate? }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, platform, handle, displayName, followers, engagementRate } = req.body as {
    workspaceId?: string
    platform?: string
    handle?: string
    displayName?: string
    followers?: number
    engagementRate?: number
  }

  if (!workspaceId || !platform || !handle) {
    sendError(res, 400, 'MISSING_FIELDS', 'workspaceId, platform, handle required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const competitor = await db.competitorAccount.create({
      data: {
        workspaceId,
        platform,
        handle: handle.replace('@', '').trim(),
        displayName: displayName ?? handle,
      },
    })

    // If the user provided real numbers, record them as MANUAL; otherwise skip initial snapshot
    if (typeof followers === 'number' && followers >= 0) {
      await db.competitorSnapshot.create({
        data: {
          competitorAccountId: competitor.id,
          followers: Math.round(followers),
          estimatedEngagement: typeof engagementRate === 'number' ? engagementRate : 0,
          source: 'MANUAL',
        },
      })
    }

    res.status(201).json({ competitor })
  } catch (err: any) {
    if (err?.code === 'P2002') { sendError(res, 409, 'DUPLICATE', 'Competitor already tracked'); return }
    logger.error({ err }, 'Add competitor error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add competitor')
  }
})

// POST /api/v1/competitors/:id/snapshot — record updated data
// Body: { followers, engagementRate? } — required (user supplies real numbers)
router.post('/:id/snapshot', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { followers, engagementRate } = req.body as { followers?: number; engagementRate?: number }

  if (typeof followers !== 'number' || followers < 0) {
    sendError(res, 400, 'MISSING_FIELDS', 'followers (number) is required')
    return
  }

  try {
    const competitor = await db.competitorAccount.findUnique({ where: { id } })
    if (!competitor) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: competitor.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const snapshot = await db.competitorSnapshot.create({
      data: {
        competitorAccountId: id,
        followers: Math.round(followers),
        estimatedEngagement: typeof engagementRate === 'number' ? engagementRate : 0,
        source: 'MANUAL',
      },
    })

    logger.info({ competitorId: id, followers }, 'Competitor snapshot recorded')
    res.json({ snapshot })
  } catch (err) {
    logger.error({ err }, 'Snapshot error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

// DELETE /api/v1/competitors/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const competitor = await db.competitorAccount.findUnique({ where: { id } })
    if (!competitor) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: competitor.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await db.competitorAccount.delete({ where: { id } })
    res.json({ message: 'Removed' })
  } catch (err) {
    logger.error({ err }, 'Delete competitor error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

export default router
