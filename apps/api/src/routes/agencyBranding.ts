import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { FF_AGENCY_APPROVALS } from '../lib/featureFlags.js'

const router = Router()

const DEFAULT_BRANDING = {
  logoUrl: null,
  primaryColor: '#6366f1',
  companyName: null,
}

// ── GET /api/v1/agency-branding/:workspaceId  (intentionally public) ──────────
// Always available regardless of FF_AGENCY_APPROVALS so the approval page can
// fetch branding without needing flag awareness.
router.get('/:workspaceId', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  try {
    const branding = await (prisma as any).workspaceBranding.findUnique({ where: { workspaceId } })
    if (!branding) {
      res.json({ branding: { ...DEFAULT_BRANDING, workspaceId } })
      return
    }
    res.json({ branding })
  } catch (err) {
    logger.error({ err }, 'Get agency branding error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get branding')
  }
})

// ── PUT /api/v1/agency-branding  (owner only, flag-gated) ─────────────────────
router.put('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!FF_AGENCY_APPROVALS) { res.status(404).json({ error: 'NOT_FOUND' }); return }

  const { workspaceId, logoUrl, primaryColor, companyName } = req.body as {
    workspaceId?: string
    logoUrl?: string | null
    primaryColor?: string
    companyName?: string | null
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required'); return }

  // Only workspace owner may update branding
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) { sendError(res, 404, 'NOT_FOUND', 'Workspace not found'); return }
  if (workspace.ownerId !== req.user!.id) {
    sendError(res, 403, 'FORBIDDEN', 'Only the workspace owner can update agency branding')
    return
  }

  // Basic color validation
  if (primaryColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(primaryColor)) {
    sendError(res, 400, 'INVALID_COLOR', 'primaryColor must be a valid hex color (e.g. #6366f1)')
    return
  }

  try {
    const branding = await (prisma as any).workspaceBranding.upsert({
      where: { workspaceId },
      update: {
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(companyName !== undefined ? { companyName } : {}),
      },
      create: {
        workspaceId,
        logoUrl: logoUrl ?? null,
        primaryColor: primaryColor ?? '#6366f1',
        companyName: companyName ?? null,
      },
    })
    res.json({ branding })
  } catch (err) {
    logger.error({ err }, 'Upsert agency branding error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update branding')
  }
})

export default router
