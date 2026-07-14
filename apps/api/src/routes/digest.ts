import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { sendWeeklyDigest } from '../lib/digest.js'
import { assertWorkspaceAccess, TenantAccessError } from '../lib/tenantGuard.js'

const router = Router()
router.use(requireAuth)

// POST /api/v1/digest/send — send digest for a specific workspace (ADMIN+ required)
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.body as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id, 'ADMIN')
    sendWeeklyDigest(workspaceId).catch(() => {})
    res.json({ message: 'Digest queued' })
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send digest')
  }
})

export default router
