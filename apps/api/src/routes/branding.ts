import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/branding/:workspaceId
router.get('/:workspaceId', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    res.json({ brandName: workspace.brandName, brandLogoUrl: workspace.brandLogoUrl, brandColor: workspace.brandColor, customDomain: workspace.customDomain })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed') }
})

// PATCH /api/v1/branding/:workspaceId
router.patch('/:workspaceId', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  const { brandName, brandLogoUrl, brandColor, customDomain } = req.body
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { brandName: brandName ?? undefined, brandLogoUrl: brandLogoUrl ?? undefined, brandColor: brandColor ?? undefined, customDomain: customDomain ?? undefined },
    })
    res.json({ workspace: updated })
  } catch { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update branding') }
})

export default router
