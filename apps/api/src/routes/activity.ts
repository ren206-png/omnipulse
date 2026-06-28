import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()

router.use(requireAuth)

// GET /api/v1/activity?workspaceId=&limit=50&page=1
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, limit: limitStr, page: pageStr } = req.query as {
    workspaceId?: string
    limit?: string
    page?: string
  }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  // Verify workspace membership
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    sendError(res, 404, 'NOT_FOUND', 'Workspace not found')
    return
  }

  const userId = req.user!.id
  const isOwner = workspace.ownerId === userId
  if (!isOwner) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!membership) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }
  }

  const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 100)
  const page = Math.max(parseInt(pageStr ?? '1', 10) || 1, 1)
  const skip = (page - 1) * limit

  try {
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where: { workspaceId } }),
    ])

    res.json({ logs, total, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    logger.error({ err }, 'List activity error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list activity logs')
  }
})

export default router
