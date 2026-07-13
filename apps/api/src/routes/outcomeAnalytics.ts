import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { FF_OUTCOME_ANALYTICS } from '../lib/featureFlags.js'
import { env } from '../config/env.js'
import {
  recordAttributionEvent,
  getPostAttributionSummary,
} from '../integrations/outcomeAnalytics/attributionService.js'

const router = Router()

// Feature flag guard — applies to all routes in this router
router.use((_req: Request, res: Response, next: Function) => {
  if (!FF_OUTCOME_ANALYTICS) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Feature not enabled' })
    return
  }
  next()
})

// Helper: verify workspace membership
async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const workspace = await (prisma.workspace.findUnique as Function)({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return 'OWNER'
  const membership = await (prisma.workspaceMember.findUnique as Function)({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return (membership?.role as 'ADMIN' | 'MEMBER') ?? null
}

const ATTRIBUTION_NOTE =
  'Metrics are attributed (correlation), not causally proven. Number pooling and cross-device journeys may affect accuracy.'

// GET /api/v1/outcome-analytics/:postId
router.get('/:postId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId } = req.query as { workspaceId?: string }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) {
    sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
    return
  }

  // Verify the post belongs to this workspace
  const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id: postId } })
  if (!post || post.workspaceId !== workspaceId) {
    sendError(res, 404, 'NOT_FOUND', 'Post not found in this workspace')
    return
  }

  try {
    const summary = await getPostAttributionSummary({ postId, workspaceId, prismaClient: prisma })
    res.json({
      postId,
      summary,
      attributionNote: ATTRIBUTION_NOTE,
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch attribution summary')
  }
})

// POST /api/v1/outcome-analytics/:postId/setup
router.post('/:postId/setup', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId, utmTag, trackedNumber } = req.body as {
    workspaceId?: string
    utmTag?: string
    trackedNumber?: string
  }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required')
    return
  }
  if (!utmTag && !trackedNumber) {
    sendError(res, 400, 'MISSING_TRACKING_PARAM', 'At least one of utmTag or trackedNumber is required')
    return
  }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) {
    sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
    return
  }

  const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id: postId } })
  if (!post || post.workspaceId !== workspaceId) {
    sendError(res, 404, 'NOT_FOUND', 'Post not found in this workspace')
    return
  }

  try {
    const attribution = await (prisma as any).postAttribution.upsert({
      where: { postId },
      create: {
        postId,
        workspaceId,
        utmTag: utmTag ?? null,
        trackedNumber: trackedNumber ?? null,
      },
      update: {
        utmTag: utmTag ?? undefined,
        trackedNumber: trackedNumber ?? undefined,
        lastUpdatedAt: new Date(),
      },
    })
    res.status(201).json({ attribution })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set up attribution')
  }
})

// POST /api/v1/outcome-analytics/ingest
// Requires auth OR x-internal-secret header
router.post('/ingest', async (req: Request, res: Response): Promise<void> => {
  // Auth check: either valid JWT session OR internal secret header
  const internalSecret = req.headers['x-internal-secret']
  const hasValidInternalSecret =
    env.INTERNAL_API_SECRET.length > 0 && internalSecret === env.INTERNAL_API_SECRET

  if (!hasValidInternalSecret) {
    // Fall back to JWT auth — check req.user (set by requireAuth if called)
    // We need to manually verify since requireAuth isn't in middleware chain here
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required')
      return
    }
    // Let requireAuth handle it by calling next inline
    await new Promise<void>((resolve, reject) => {
      requireAuth(req, res, (err?: any) => {
        if (err) reject(err)
        else resolve()
      })
    }).catch(() => {})
    // If requireAuth sent a response already, bail out
    if (res.headersSent) return
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required')
      return
    }
  }

  const { postId, workspaceId, eventType, source, metadata } = req.body as {
    postId?: string
    workspaceId?: string
    eventType?: string
    source?: string
    metadata?: Record<string, unknown>
  }

  if (!postId || !workspaceId || !eventType || !source) {
    sendError(res, 400, 'MISSING_FIELDS', 'postId, workspaceId, eventType, and source are required')
    return
  }
  if (eventType !== 'call' && eventType !== 'booking') {
    sendError(res, 400, 'INVALID_EVENT_TYPE', "eventType must be 'call' or 'booking'")
    return
  }
  if (source !== 'phone' && source !== 'utm_link') {
    sendError(res, 400, 'INVALID_SOURCE', "source must be 'phone' or 'utm_link'")
    return
  }

  // Verify the post exists in the claimed workspace — prevents cross-workspace poisoning
  const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id: postId } })
  if (!post || post.workspaceId !== workspaceId) {
    sendError(res, 404, 'NOT_FOUND', 'Post not found in this workspace')
    return
  }

  // If authenticated via JWT, also verify workspace membership
  if (req.user) {
    const role = await getWorkspaceRole(workspaceId, req.user.id)
    if (!role) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }
  }

  try {
    await recordAttributionEvent({
      postId,
      workspaceId,
      event: { source: source as 'phone' | 'utm_link', eventType: eventType as 'call' | 'booking', metadata },
      prismaClient: prisma,
    })
    res.status(204).send()
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record attribution event')
  }
})

// GET /api/v1/outcome-analytics/summary?workspaceId=
router.get('/summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }

  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) {
    sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
    return
  }

  try {
    const attributions = await (prisma as any).postAttribution.findMany({
      where: { workspaceId },
      orderBy: [{ callsReceived: 'desc' }, { bookingsCreated: 'desc' }],
      include: {
        post: {
          select: {
            id: true,
            content: true,
            platforms: true,
            scheduledFor: true,
            status: true,
          },
        },
      },
    })

    const posts = attributions.map((a: any) => ({
      postId: a.postId,
      content: a.post.content.slice(0, 100),
      platform: a.post.platforms as string[],
      callsReceived: a.callsReceived,
      bookingsCreated: a.bookingsCreated,
      utmTag: a.utmTag ?? undefined,
      publishedAt: a.post.scheduledFor.toISOString(),
    }))

    const totals = attributions.reduce(
      (acc: { callsReceived: number; bookingsCreated: number }, a: any) => ({
        callsReceived: acc.callsReceived + a.callsReceived,
        bookingsCreated: acc.bookingsCreated + a.bookingsCreated,
      }),
      { callsReceived: 0, bookingsCreated: 0 },
    )

    res.json({
      posts,
      totals,
      attributionNote: ATTRIBUTION_NOTE,
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch workspace summary')
  }
})

export default router
