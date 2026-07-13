import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { notify, getWorkspaceAdmins } from '../lib/notify.js'
import { FF_AGENCY_APPROVALS } from '../lib/featureFlags.js'

const router = Router()

// ── Magic link validation helper ─────────────────────────────────────────────
async function validateMagicLink(
  token: string,
): Promise<{ workspaceId: string; email: string } | null> {
  const link = await (prisma as any).approvalMagicLink.findUnique({ where: { token } })
  if (!link) return null
  if (link.revokedAt) return null
  if (link.expiresAt < new Date()) return null
  await (prisma as any).approvalMagicLink.update({
    where: { token },
    data: { lastUsedAt: new Date() },
  })
  return { workspaceId: link.workspaceId, email: link.email }
}

// ── Workspace role resolver (returns null if no access) ───────────────────────
async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | 'CLIENT_APPROVER' | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return 'OWNER'
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return (membership?.role as 'ADMIN' | 'MEMBER' | 'CLIENT_APPROVER') ?? null
}

// ── Auth resolver: JWT user OR magic-link token ───────────────────────────────
// Returns { userId, userEmail, workspaceId (from token) | undefined, isMagicLink }
interface CallerContext {
  userId: string | null
  userEmail: string
  magicLinkWorkspaceId: string | null
  isMagicLink: boolean
}

async function resolveCaller(req: Request): Promise<CallerContext | null> {
  const tokenHeader = req.headers['x-approval-token'] as string | undefined
  if (tokenHeader) {
    const link = await validateMagicLink(tokenHeader)
    if (!link) return null
    return {
      userId: null,
      userEmail: link.email,
      magicLinkWorkspaceId: link.workspaceId,
      isMagicLink: true,
    }
  }
  // Fall through to JWT
  if (req.user) {
    return {
      userId: req.user.id,
      userEmail: req.user.email,
      magicLinkWorkspaceId: null,
      isMagicLink: false,
    }
  }
  return null
}

// Apply JWT middleware — but magic-link routes will also be reachable without a
// valid JWT (resolveCaller handles both paths).  We register requireAuth as an
// optional step: it populates req.user when a valid JWT is present but does NOT
// reject the request when the header is absent so that magic-link callers can
// proceed.
router.use((req, res, next) => {
  // If x-approval-token is present, skip JWT enforcement
  if (req.headers['x-approval-token']) return next()
  return requireAuth(req, res, next)
})

// ── Feature flag guard ────────────────────────────────────────────────────────
router.use((_req, res, next) => {
  if (!FF_AGENCY_APPROVALS) { res.status(404).json({ error: 'NOT_FOUND' }); return }
  next()
})

// ── POST /api/v1/approvals/:postId/submit  DRAFT → PENDING_REVIEW ────────────
router.post('/:postId/submit', async (req: Request, res: Response): Promise<void> => {
  const caller = await resolveCaller(req)
  if (!caller) { sendError(res, 401, 'UNAUTHORIZED', 'Authentication required'); return }
  if (caller.isMagicLink) { sendError(res, 403, 'FORBIDDEN', 'Magic-link callers cannot submit posts'); return }

  const { postId } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, caller.userId!)
    if (!role || role === 'MEMBER' || role === 'CLIENT_APPROVER') {
      sendError(res, 403, 'FORBIDDEN', 'Only owners and admins can submit posts for review'); return
    }
    if (post.status !== 'DRAFT') {
      sendError(res, 409, 'INVALID_TRANSITION', `Cannot submit a post with status ${post.status}`); return
    }

    const updated = await prisma.scheduledPost.update({
      where: { id: postId },
      data: { status: 'PENDING_REVIEW', submittedBy: caller.userId },
    })

    // Notify workspace owners/admins
    const adminIds = await getWorkspaceAdmins(post.workspaceId)
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          userId,
          type: 'POST_SUBMITTED_REVIEW',
          title: 'Post submitted for review',
          body: `A post has been submitted for approval in your workspace.`,
          link: `/dashboard/approvals/${postId}?workspaceId=${post.workspaceId}`,
        }),
      ),
    )

    res.json({ post: updated })
  } catch (err) {
    logger.error({ err }, 'Submit for approval error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit post for review')
  }
})

// ── POST /api/v1/approvals/:postId/approve  PENDING_REVIEW → APPROVED ─────────
router.post('/:postId/approve', async (req: Request, res: Response): Promise<void> => {
  const caller = await resolveCaller(req)
  if (!caller) { sendError(res, 401, 'UNAUTHORIZED', 'Authentication required'); return }

  const { postId } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    // Authorise: magic-link must match the post's workspace
    if (caller.isMagicLink) {
      if (caller.magicLinkWorkspaceId !== post.workspaceId) {
        sendError(res, 403, 'FORBIDDEN', 'Magic link is not valid for this workspace'); return
      }
    } else {
      const role = await getWorkspaceRole(post.workspaceId, caller.userId!)
      if (!role || role === 'MEMBER') {
        sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions to approve posts'); return
      }
    }

    if (post.status !== 'PENDING_REVIEW') {
      sendError(res, 409, 'INVALID_TRANSITION', `Cannot approve a post with status ${post.status}`); return
    }

    // Atomic update + comment creation to prevent approve/reject race
    const [updated] = await prisma.$transaction([
      prisma.scheduledPost.update({
        where: { id: postId, status: 'PENDING_REVIEW' }, // optimistic lock on status
        data: { status: 'APPROVED', reviewedBy: caller.userId ?? caller.userEmail },
      }),
      (prisma.postComment as any).create({
        data: {
          postId,
          userId: caller.userId ?? 'magic-link',
          userEmail: caller.userEmail,
          body: `[APPROVED by ${caller.userEmail}]`,
        },
      }),
    ])

    // Notify workspace owner(s)
    const adminIds = await getWorkspaceAdmins(post.workspaceId)
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          userId,
          type: 'POST_APPROVED',
          title: 'Post approved',
          body: `A post was approved by ${caller.userEmail}.`,
          link: `/dashboard/approvals/${postId}?workspaceId=${post.workspaceId}`,
        }),
      ),
    )

    res.json({ post: updated })
  } catch (err: any) {
    // P2025 = record not found for update — means status was already changed (race)
    if (err?.code === 'P2025') {
      sendError(res, 409, 'CONCURRENT_MODIFICATION', 'Post status was changed by another request'); return
    }
    logger.error({ err }, 'Approve post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve post')
  }
})

// ── POST /api/v1/approvals/:postId/reject  PENDING_REVIEW → DRAFT ─────────────
router.post('/:postId/reject', async (req: Request, res: Response): Promise<void> => {
  const caller = await resolveCaller(req)
  if (!caller) { sendError(res, 401, 'UNAUTHORIZED', 'Authentication required'); return }

  const { reason } = req.body as { reason?: string }
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    sendError(res, 400, 'REASON_REQUIRED', 'A rejection reason is required'); return
  }

  const { postId } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id: postId } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    if (caller.isMagicLink) {
      if (caller.magicLinkWorkspaceId !== post.workspaceId) {
        sendError(res, 403, 'FORBIDDEN', 'Magic link is not valid for this workspace'); return
      }
    } else {
      const role = await getWorkspaceRole(post.workspaceId, caller.userId!)
      if (!role || role === 'MEMBER') {
        sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions to reject posts'); return
      }
    }

    if (post.status !== 'PENDING_REVIEW') {
      sendError(res, 409, 'INVALID_TRANSITION', `Cannot reject a post with status ${post.status}`); return
    }

    const [updated] = await prisma.$transaction([
      prisma.scheduledPost.update({
        where: { id: postId, status: 'PENDING_REVIEW' },
        data: { status: 'DRAFT', reviewedBy: caller.userId ?? caller.userEmail },
      }),
      (prisma.postComment as any).create({
        data: {
          postId,
          userId: caller.userId ?? 'magic-link',
          userEmail: caller.userEmail,
          body: `[REJECTED: ${reason.trim()}]`,
        },
      }),
    ])

    const adminIds = await getWorkspaceAdmins(post.workspaceId)
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          userId,
          type: 'POST_REJECTED',
          title: 'Post rejected',
          body: `A post was rejected by ${caller.userEmail}: ${reason.trim()}`,
          link: `/dashboard/approvals/${postId}?workspaceId=${post.workspaceId}`,
        }),
      ),
    )

    res.json({ post: updated })
  } catch (err: any) {
    if (err?.code === 'P2025') {
      sendError(res, 409, 'CONCURRENT_MODIFICATION', 'Post status was changed by another request'); return
    }
    logger.error({ err }, 'Reject post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject post')
  }
})

// ── GET /api/v1/approvals?workspaceId=  list PENDING_REVIEW posts ─────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const caller = await resolveCaller(req)
  if (!caller) { sendError(res, 401, 'UNAUTHORIZED', 'Authentication required'); return }

  const workspaceId = (req.query.workspaceId as string) ?? caller.magicLinkWorkspaceId
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required'); return }

  if (caller.isMagicLink && caller.magicLinkWorkspaceId !== workspaceId) {
    sendError(res, 403, 'FORBIDDEN', 'Magic link is not valid for this workspace'); return
  }
  if (!caller.isMagicLink) {
    const role = await getWorkspaceRole(workspaceId, caller.userId!)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  }

  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
    })
    res.json({ posts })
  } catch (err) {
    logger.error({ err }, 'List approvals error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list pending approvals')
  }
})

// ── GET /api/v1/approvals/:postId  post with full comment thread ──────────────
router.get('/:postId', async (req: Request, res: Response): Promise<void> => {
  const caller = await resolveCaller(req)
  if (!caller) { sendError(res, 401, 'UNAUTHORIZED', 'Authentication required'); return }

  const { postId } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({
      where: { id: postId },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
    })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    if (caller.isMagicLink) {
      if (caller.magicLinkWorkspaceId !== post.workspaceId) {
        sendError(res, 403, 'FORBIDDEN', 'Magic link is not valid for this workspace'); return
      }
    } else {
      const role = await getWorkspaceRole(post.workspaceId, caller.userId!)
      if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    }

    res.json({ post })
  } catch (err) {
    logger.error({ err }, 'Get approval post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get post')
  }
})

export default router
