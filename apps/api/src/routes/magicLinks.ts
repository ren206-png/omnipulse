import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { FF_AGENCY_APPROVALS } from '../lib/featureFlags.js'
import { sendEmail } from '../lib/mailer.js'
import { magicLinkEmail } from '../lib/emailTemplates.js'
import { env } from '../config/env.js'

const router = Router()

router.use(requireAuth)

router.use((_req, res, next) => {
  if (!FF_AGENCY_APPROVALS) { res.status(404).json({ error: 'NOT_FOUND' }); return }
  next()
})

const MAX_EXPIRES_DAYS = 90
const DEFAULT_EXPIRES_DAYS = 30

// Verify caller is OWNER or ADMIN in the given workspace
async function requireOwnerOrAdmin(
  req: Request,
  res: Response,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) { sendError(res, 404, 'NOT_FOUND', 'Workspace not found'); return false }
  if (workspace.ownerId === req.user!.id) return true
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
  })
  if (membership?.role === 'ADMIN' || membership?.role === 'OWNER') return true
  sendError(res, 403, 'FORBIDDEN', 'Only owners and admins can manage magic links')
  return false
}

// ── POST /api/v1/magic-links ──────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, email, expiresInDays } = req.body as {
    workspaceId?: string
    email?: string
    expiresInDays?: number
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required'); return }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendError(res, 400, 'INVALID_EMAIL', 'A valid email address is required'); return
  }

  if (!await requireOwnerOrAdmin(req, res, workspaceId)) return

  const days = Math.min(
    typeof expiresInDays === 'number' && expiresInDays > 0 ? expiresInDays : DEFAULT_EXPIRES_DAYS,
    MAX_EXPIRES_DAYS,
  )
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  try {
    const [link, workspace] = await Promise.all([
      (prisma as any).approvalMagicLink.create({
        data: {
          workspaceId,
          email: email.toLowerCase().trim(),
          createdBy: req.user!.id,
          expiresAt,
        },
      }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    ])

    // Send magic link email to recipient
    const linkUrl = `${env.APP_URL}/approval/${link.token}`
    await sendEmail({
      to: link.email,
      ...magicLinkEmail({
        workspaceName: workspace?.name ?? 'your workspace',
        inviterName: req.user!.email,
        magicLinkUrl: linkUrl,
        expiresAt: link.expiresAt,
      }),
    })

    res.status(201).json({ link })
  } catch (err) {
    logger.error({ err }, 'Create magic link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create magic link')
  }
})

// ── GET /api/v1/magic-links?workspaceId= ─────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required'); return }

  if (!await requireOwnerOrAdmin(req, res, workspaceId)) return

  try {
    const links = await (prisma as any).approvalMagicLink.findMany({
      where: {
        workspaceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ links })
  } catch (err) {
    logger.error({ err }, 'List magic links error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list magic links')
  }
})

// ── DELETE /api/v1/magic-links/:id/revoke ────────────────────────────────────
router.delete('/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const link = await (prisma as any).approvalMagicLink.findUnique({ where: { id } })
    if (!link) { sendError(res, 404, 'NOT_FOUND', 'Magic link not found'); return }

    if (!await requireOwnerOrAdmin(req, res, link.workspaceId)) return

    const updated = await (prisma as any).approvalMagicLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
    res.json({ link: updated })
  } catch (err) {
    logger.error({ err }, 'Revoke magic link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke magic link')
  }
})

export default router
