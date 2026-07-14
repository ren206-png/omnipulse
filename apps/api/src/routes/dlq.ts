import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { publishPostQueue } from '../lib/queue.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const router = Router()

// Admin check: must be authenticated and must be the ADMIN_EMAIL
function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!env.ADMIN_EMAIL) { sendError(res, 404, 'NOT_FOUND', 'Not found'); return }
  if (!req.user?.email || req.user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied')
    return
  }
  next()
}

router.use(requireAuth)
router.use(requireAdmin as unknown as (req: Request, res: Response, next: () => void) => void)

// GET /api/v1/admin/dlq?page=1&limit=50&workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { page = '1', limit = '50', workspaceId } = req.query as Record<string, string>
  const pageNum = Math.max(1, parseInt(page, 10))
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)))
  const skip = (pageNum - 1) * limitNum

  // Tenant isolation: if a foreign workspaceId is supplied by a non-admin, reject
  // (admin already confirmed above, so this just gates the filter parameter)
  const where: Record<string, unknown> = { resolvedAt: null }
  if (workspaceId) {
    where.workspaceId = workspaceId
  }

  try {
    const [entries, total] = await Promise.all([
      (prisma as any).postDlq.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: { workspace: { select: { id: true, name: true } } },
      }),
      (prisma as any).postDlq.count({ where }),
    ])
    res.json({ entries, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) })
  } catch (err) {
    logger.error({ err }, 'List DLQ error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list DLQ entries')
  }
})

// POST /api/v1/admin/dlq/:id/resolve
router.post('/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const entry = await (prisma as any).postDlq.findUnique({ where: { id } })
    if (!entry) { sendError(res, 404, 'NOT_FOUND', 'DLQ entry not found'); return }
    if (entry.resolvedAt) { res.json({ ok: true, alreadyResolved: true }); return }

    await (prisma as any).postDlq.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: req.user!.id },
    })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Resolve DLQ error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve DLQ entry')
  }
})

// POST /api/v1/admin/dlq/:id/retry
router.post('/:id/retry', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const entry = await (prisma as any).postDlq.findUnique({ where: { id } })
    if (!entry) { sendError(res, 404, 'NOT_FOUND', 'DLQ entry not found'); return }

    // Fetch post to get workspaceId for payload verification in worker
    const post = await (prisma as any).scheduledPost.findUnique({ where: { id: entry.postId }, select: { workspaceId: true } })

    // Reset post to SCHEDULED and re-enqueue
    await (prisma as any).scheduledPost.update({
      where: { id: entry.postId },
      data: { status: 'SCHEDULED', errorLog: null },
    })

    await publishPostQueue.add(
      'publish-post',
      { postId: entry.postId, workspaceId: post?.workspaceId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    )

    // Mark DLQ entry as resolved
    await (prisma as any).postDlq.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: req.user!.id },
    })

    logger.info({ dlqId: id, postId: entry.postId }, 'DLQ entry retried by admin')
    res.json({ ok: true, postId: entry.postId })
  } catch (err) {
    logger.error({ err }, 'Retry DLQ error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to retry DLQ entry')
  }
})

export default router
