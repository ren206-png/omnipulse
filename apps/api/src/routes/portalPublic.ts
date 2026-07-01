import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { sendError } from '../lib/apiError.js'
import { randomUUID } from 'crypto'

const router = Router()
const db = prisma as any

// GET /portal/:token — portal info + pending posts (public, no auth)
router.get('/portal/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  try {
    const portal = await db.clientPortal.findUnique({
      where: { token },
      include: { workspace: true },
    })
    if (!portal || !portal.active) {
      sendError(res, 404, 'NOT_FOUND', 'Portal not found or inactive')
      return
    }

    // Fetch pending/scheduled posts for this workspace
    let pendingPosts: any[] = []
    try {
      pendingPosts = await db.scheduledPost.findMany({
        where: {
          workspaceId: portal.workspaceId,
          status: { in: ['SCHEDULED', 'PENDING_REVIEW'] },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 50,
        select: { id: true, content: true, platforms: true, scheduledFor: true, status: true },
      })
    } catch {
      // scheduledPost model may not exist in this schema variant — return empty
    }

    // Fetch existing approvals for these posts
    const postIds = pendingPosts.map((p: any) => p.id)
    const approvalMap: Record<string, any> = {}
    if (postIds.length > 0) {
      try {
        const approvals = await db.postApproval.findMany({
          where: { portalToken: token, postId: { in: postIds } },
        })
        for (const a of approvals) approvalMap[a.postId] = a
      } catch { /* PostApproval table may not exist yet */ }
    }

    const posts = pendingPosts.map((p: any) => ({
      id: p.id,
      content: (p.content ?? '').slice(0, 200),
      platforms: p.platforms ?? [],
      scheduledFor: p.scheduledFor,
      status: p.status,
      existingApproval: approvalMap[p.id] ?? null,
    }))

    res.json({
      clientName: portal.clientName,
      workspaceName: (portal.workspace as any).brandName ?? (portal.workspace as any).name ?? '',
      posts,
    })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

// POST /portal/:token/approve — approve a post (public, no auth)
router.post('/portal/:token/approve', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  const { postId, comment } = req.body
  if (!postId) { sendError(res, 400, 'BAD_REQUEST', 'postId required'); return }
  try {
    const portal = await db.clientPortal.findUnique({ where: { token } })
    if (!portal || !portal.active) { sendError(res, 404, 'NOT_FOUND', 'Portal not found or inactive'); return }

    try {
      await db.postApproval.upsert({
        where: { portalToken_postId: { portalToken: token, postId } },
        create: {
          id: randomUUID(),
          portalToken: token,
          postId,
          status: 'APPROVED',
          comment: comment ?? null,
          reviewedAt: new Date(),
        },
        update: { status: 'APPROVED', comment: comment ?? null, reviewedAt: new Date() },
      })
    } catch { /* PostApproval table may not exist yet */ }

    try {
      await db.scheduledPost.update({ where: { id: postId }, data: { status: 'APPROVED' } })
    } catch { /* scheduledPost may not support APPROVED status */ }

    res.json({ ok: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

// POST /portal/:token/reject — reject a post (public, no auth)
router.post('/portal/:token/reject', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  const { postId, comment } = req.body
  if (!postId) { sendError(res, 400, 'BAD_REQUEST', 'postId required'); return }
  try {
    const portal = await db.clientPortal.findUnique({ where: { token } })
    if (!portal || !portal.active) { sendError(res, 404, 'NOT_FOUND', 'Portal not found or inactive'); return }

    try {
      await db.postApproval.upsert({
        where: { portalToken_postId: { portalToken: token, postId } },
        create: {
          id: randomUUID(),
          portalToken: token,
          postId,
          status: 'REJECTED',
          comment: comment ?? null,
          reviewedAt: new Date(),
        },
        update: { status: 'REJECTED', comment: comment ?? null, reviewedAt: new Date() },
      })
    } catch { /* PostApproval table may not exist yet */ }

    try {
      await db.scheduledPost.update({ where: { id: postId }, data: { status: 'PENDING_REVIEW' } })
    } catch { /* swallow */ }

    res.json({ ok: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed')
  }
})

export default router
