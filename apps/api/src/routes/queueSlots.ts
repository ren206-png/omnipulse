import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { isValidTimezone, isValidTimeOfDay } from '../lib/queueScheduler.js'

const router = Router()
router.use(requireAuth)

async function assertWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return false
  if (ws.ownerId === userId) return true
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return !!membership
}

// GET /api/v1/queue-slots?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId required'); return }

  if (!(await assertWorkspaceAccess(workspaceId, req.user!.id))) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    const slots = await (prisma.queueSlot.findMany as Function)({
      where: { workspaceId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { timeOfDay: 'asc' }],
    })
    res.json({ slots })
  } catch (err) {
    logger.error({ err }, 'List queue slots error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list queue slots')
  }
})

// POST /api/v1/queue-slots
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, dayOfWeek, timeOfDay, timezone, platform } = req.body as {
    workspaceId?: string
    dayOfWeek?: number
    timeOfDay?: string
    timezone?: string
    platform?: string
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (dayOfWeek === undefined || dayOfWeek === null) { sendError(res, 400, 'MISSING_FIELD', 'dayOfWeek is required'); return }
  if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
    sendError(res, 400, 'INVALID_FIELD', 'dayOfWeek must be 0–6'); return
  }
  if (!timeOfDay) { sendError(res, 400, 'MISSING_FIELD', 'timeOfDay is required'); return }
  if (!isValidTimeOfDay(timeOfDay)) {
    sendError(res, 400, 'INVALID_FIELD', 'timeOfDay must be HH:MM (24-hour format)'); return
  }
  if (!timezone) { sendError(res, 400, 'MISSING_FIELD', 'timezone is required'); return }
  if (!isValidTimezone(timezone)) {
    sendError(res, 400, 'INVALID_FIELD', `Invalid IANA timezone: "${timezone}"`); return
  }

  const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN']
  if (platform && !VALID_PLATFORMS.includes(platform)) {
    sendError(res, 400, 'INVALID_PLATFORM', `Invalid platform: "${platform}"`); return
  }

  if (!(await assertWorkspaceAccess(workspaceId, req.user!.id))) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    const slot = await (prisma.queueSlot.create as Function)({
      data: {
        workspaceId,
        dayOfWeek,
        timeOfDay,
        timezone,
        ...(platform ? { platform } : {}),
        isActive: true,
      },
    })
    logger.info({ slotId: slot.id, workspaceId }, 'Queue slot created')
    res.status(201).json({ slot })
  } catch (err) {
    logger.error({ err }, 'Create queue slot error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create queue slot')
  }
})

// PATCH /api/v1/queue-slots/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { dayOfWeek, timeOfDay, timezone, platform, isActive } = req.body as {
    dayOfWeek?: number
    timeOfDay?: string
    timezone?: string
    platform?: string | null
    isActive?: boolean
  }

  try {
    const slot = await (prisma.queueSlot.findUnique as Function)({ where: { id } })
    if (!slot) { sendError(res, 404, 'NOT_FOUND', 'Queue slot not found'); return }

    if (!(await assertWorkspaceAccess(slot.workspaceId, req.user!.id))) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const updates: Record<string, unknown> = {}

    if (dayOfWeek !== undefined) {
      if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
        sendError(res, 400, 'INVALID_FIELD', 'dayOfWeek must be 0–6'); return
      }
      updates.dayOfWeek = dayOfWeek
    }
    if (timeOfDay !== undefined) {
      if (!isValidTimeOfDay(timeOfDay)) {
        sendError(res, 400, 'INVALID_FIELD', 'timeOfDay must be HH:MM'); return
      }
      updates.timeOfDay = timeOfDay
    }
    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        sendError(res, 400, 'INVALID_FIELD', `Invalid timezone: "${timezone}"`); return
      }
      updates.timezone = timezone
    }
    if (platform !== undefined) {
      const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN']
      if (platform !== null && !VALID_PLATFORMS.includes(platform)) {
        sendError(res, 400, 'INVALID_PLATFORM', `Invalid platform: "${platform}"`); return
      }
      updates.platform = platform
    }
    if (isActive !== undefined) updates.isActive = isActive

    const updated = await (prisma.queueSlot.update as Function)({ where: { id }, data: updates })
    res.json({ slot: updated })
  } catch (err) {
    logger.error({ err }, 'Update queue slot error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update queue slot')
  }
})

// DELETE /api/v1/queue-slots/:id  (soft delete — sets isActive = false)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const slot = await (prisma.queueSlot.findUnique as Function)({ where: { id } })
    if (!slot) { sendError(res, 404, 'NOT_FOUND', 'Queue slot not found'); return }

    if (!(await assertWorkspaceAccess(slot.workspaceId, req.user!.id))) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await (prisma.queueSlot.update as Function)({ where: { id }, data: { isActive: false } })
    logger.info({ slotId: id }, 'Queue slot deactivated')
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete queue slot error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete queue slot')
  }
})

export default router
