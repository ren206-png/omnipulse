import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { sendWeeklyDigest } from '../lib/digest.js'

const router = Router()
router.use(requireAuth)

// POST /api/v1/digest/send — send digest for a specific workspace (or all if admin)
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.body as { workspaceId?: string }
  try {
    sendWeeklyDigest(workspaceId).catch(() => {})
    res.json({ message: 'Digest queued' })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send digest')
  }
})

export default router
