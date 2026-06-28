import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { checkLimit } from '../lib/planLimits.js'
import { notify, getWorkspaceAdmins } from '../lib/notify.js'
import { sendInvitationEmail } from '../lib/email.js'

const router = Router()

router.use(requireAuth)

// Check that the requester is at least ADMIN in the workspace
async function requireAdmin(
  req: Request,
  res: Response,
  workspaceId: string,
): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
  })
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

  const isOwner = workspace?.ownerId === req.user!.id
  const isAdmin = membership?.role === 'ADMIN' || membership?.role === 'OWNER'

  if (!isOwner && !isAdmin) {
    sendError(res, 403, 'FORBIDDEN', 'You must be an admin or owner of this workspace')
    return false
  }
  return true
}

// Check that user has any access to this workspace
async function requireMember(
  req: Request,
  res: Response,
  workspaceId: string,
): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) {
    sendError(res, 404, 'NOT_FOUND', 'Workspace not found')
    return false
  }

  const isOwner = workspace.ownerId === req.user!.id
  if (isOwner) return true

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
  })
  if (!membership) {
    sendError(res, 403, 'FORBIDDEN', 'You do not have access to this workspace')
    return false
  }
  return true
}

// GET /api/v1/team/:workspaceId/members
router.get('/:workspaceId/members', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  if (!await requireMember(req, res, workspaceId)) return

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: { select: { id: true, email: true } },
        members: {
          include: { user: { select: { id: true, email: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })

    if (!workspace) { sendError(res, 404, 'NOT_FOUND', 'Workspace not found'); return }

    const ownerEntry = {
      id: workspace.owner.id,
      email: workspace.owner.email,
      role: 'OWNER' as const,
      joinedAt: null,
      memberId: null,
    }

    const memberEntries = workspace.members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
      memberId: m.id,
    }))

    res.json({ members: [ownerEntry, ...memberEntries] })
  } catch (err) {
    logger.error({ err }, 'List members error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list members')
  }
})

// GET /api/v1/team/:workspaceId/invitations
router.get('/:workspaceId/invitations', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  if (!await requireAdmin(req, res, workspaceId)) return

  try {
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
    })
    res.json({ invitations })
  } catch (err) {
    logger.error({ err }, 'List invitations error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list invitations')
  }
})

// POST /api/v1/team/:workspaceId/invitations
router.post('/:workspaceId/invitations', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.params
  if (!await requireAdmin(req, res, workspaceId)) return

  const { email, role = 'MEMBER' } = req.body as { email?: string; role?: string }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendError(res, 400, 'INVALID_EMAIL', 'Valid email is required')
    return
  }
  if (!['ADMIN', 'MEMBER'].includes(role)) {
    sendError(res, 400, 'INVALID_ROLE', 'Role must be ADMIN or MEMBER')
    return
  }

  try {
    // Plan gate: team members limit
    const { allowed, limit: memberLimit, current: memberCurrent } = await checkLimit(prisma, workspaceId, 'teamMembers')
    if (!allowed) {
      sendError(res, 403, 'PLAN_LIMIT', `Plan limit reached: ${memberCurrent}/${memberLimit} team members. Upgrade to add more.`)
      return
    }

    // Check user isn't already a member
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
      if (workspace?.ownerId === existingUser.id) {
        sendError(res, 409, 'ALREADY_MEMBER', 'This user is already the owner')
        return
      }
      const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      })
      if (existing) {
        sendError(res, 409, 'ALREADY_MEMBER', 'This user is already a member')
        return
      }
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitation = await prisma.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      update: { role: role as 'ADMIN' | 'MEMBER', expiresAt, acceptedAt: null },
      create: { workspaceId, email, role: role as 'ADMIN' | 'MEMBER', expiresAt },
    })

    const inviteUrl = `${process.env.WEB_URL ?? 'http://localhost:3000'}/invite/${invitation.token}`
    logger.info({ inviteUrl, email, workspaceId }, 'Invitation created (dev: use this URL)')

    // Send invitation email (non-fatal — errors are logged inside sendInvitationEmail)
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    await sendInvitationEmail({
      to: email,
      inviterEmail: req.user!.email,
      workspaceName: workspace?.name ?? workspaceId,
      role,
      inviteToken: invitation.token,
    })

    res.status(201).json({ invitation: { id: invitation.id, email, role, expiresAt }, inviteUrl })
  } catch (err) {
    logger.error({ err }, 'Create invitation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create invitation')
  }
})

// DELETE /api/v1/team/:workspaceId/invitations/:id
router.delete('/:workspaceId/invitations/:id', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, id } = req.params
  if (!await requireAdmin(req, res, workspaceId)) return

  try {
    await prisma.workspaceInvitation.deleteMany({ where: { id, workspaceId } })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Delete invitation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke invitation')
  }
})

// PATCH /api/v1/team/:workspaceId/members/:userId — change role
router.patch('/:workspaceId/members/:userId', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, userId } = req.params
  if (!await requireAdmin(req, res, workspaceId)) return

  const { role } = req.body as { role?: string }
  if (!role || !['ADMIN', 'MEMBER'].includes(role)) {
    sendError(res, 400, 'INVALID_ROLE', 'Role must be ADMIN or MEMBER')
    return
  }

  // Cannot demote yourself if you're the only admin
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (workspace?.ownerId === userId) {
    sendError(res, 400, 'CANNOT_MODIFY_OWNER', 'Cannot change the owner\'s role')
    return
  }

  try {
    const member = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: role as 'ADMIN' | 'MEMBER' },
    })
    res.json({ member })
  } catch (err) {
    logger.error({ err }, 'Update member role error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update role')
  }
})

// DELETE /api/v1/team/:workspaceId/members/:userId — remove member
router.delete('/:workspaceId/members/:userId', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, userId } = req.params

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) { sendError(res, 404, 'NOT_FOUND', 'Workspace not found'); return }

  // Owner can remove anyone; admins can remove members; members can only remove themselves
  const isOwner = workspace.ownerId === req.user!.id
  const isSelf = userId === req.user!.id

  if (!isOwner && !isSelf) {
    const myMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (myMembership?.role !== 'ADMIN') {
      sendError(res, 403, 'FORBIDDEN', 'You cannot remove other members')
      return
    }
  }

  if (workspace.ownerId === userId) {
    sendError(res, 400, 'CANNOT_REMOVE_OWNER', 'Cannot remove the workspace owner')
    return
  }

  try {
    await prisma.workspaceMember.deleteMany({ where: { workspaceId, userId } })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Remove member error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove member')
  }
})

// GET /api/v1/team/invitations/:token — public, get invite details
router.get('/invitations/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  try {
    const inv = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, name: true } } },
    })
    if (!inv) { sendError(res, 404, 'NOT_FOUND', 'Invitation not found or expired'); return }
    if (inv.acceptedAt) { sendError(res, 410, 'ALREADY_ACCEPTED', 'This invitation has already been used'); return }
    if (inv.expiresAt < new Date()) { sendError(res, 410, 'EXPIRED', 'This invitation has expired'); return }

    res.json({
      invitation: {
        email: inv.email,
        role: inv.role,
        workspaceName: inv.workspace.name,
        workspaceId: inv.workspace.id,
        expiresAt: inv.expiresAt,
      },
    })
  } catch (err) {
    logger.error({ err }, 'Get invitation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get invitation')
  }
})

// POST /api/v1/team/invitations/:token/accept — requires auth
router.post('/invitations/:token/accept', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params
  try {
    const inv = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: true },
    })
    if (!inv) { sendError(res, 404, 'NOT_FOUND', 'Invitation not found'); return }
    if (inv.acceptedAt) { sendError(res, 410, 'ALREADY_ACCEPTED', 'Invitation already used'); return }
    if (inv.expiresAt < new Date()) { sendError(res, 410, 'EXPIRED', 'Invitation expired'); return }

    // Email must match the logged-in user
    if (inv.email.toLowerCase() !== req.user!.email.toLowerCase()) {
      sendError(res, 403, 'EMAIL_MISMATCH', 'This invitation was sent to a different email address')
      return
    }

    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: req.user!.id } },
        update: { role: inv.role },
        create: { workspaceId: inv.workspaceId, userId: req.user!.id, role: inv.role },
      }),
      prisma.workspaceInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      }),
    ])

    logger.info({ userId: req.user!.id, workspaceId: inv.workspaceId }, 'Invitation accepted')

    // Notify workspace admins/owners
    const adminIds = await getWorkspaceAdmins(inv.workspaceId)
    await Promise.all(adminIds.filter((id) => id !== req.user!.id).map((userId) =>
      notify({
        userId,
        type: 'MEMBER_JOINED',
        title: 'New team member joined',
        body: `${req.user!.email} accepted their invitation to ${inv.workspace.name}`,
        link: `/dashboard/settings/team?workspaceId=${inv.workspaceId}`,
      })
    ))

    res.json({ workspaceId: inv.workspaceId, workspaceName: inv.workspace.name })
  } catch (err) {
    logger.error({ err }, 'Accept invitation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to accept invitation')
  }
})

export default router
