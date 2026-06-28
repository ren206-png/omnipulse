import { Router } from 'express'
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { emitWebhook } from '../lib/webhookEmitter.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/webhooks?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    // Mask the secret in list responses
    const masked = endpoints.map((ep) => ({
      ...ep,
      secret: `${ep.secret.slice(0, 6)}${'*'.repeat(ep.secret.length - 6)}`,
    }))
    res.json({ endpoints: masked })
  } catch (err) {
    logger.error({ err }, 'List webhooks error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list webhooks')
  }
})

// POST /api/v1/webhooks
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, url, events, active } = req.body as {
    workspaceId?: string
    url?: string
    events?: string[]
    active?: boolean
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!url || !url.trim()) { sendError(res, 400, 'MISSING_FIELD', 'url is required'); return }
  if (!Array.isArray(events) || events.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'events array is required'); return }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const secret = crypto.randomBytes(32).toString('hex')
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        workspaceId,
        url: url.trim(),
        secret,
        events,
        active: active ?? true,
      },
    })

    // Return the full secret once on creation
    res.status(201).json({ endpoint })
  } catch (err) {
    logger.error({ err }, 'Create webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create webhook')
  }
})

// PATCH /api/v1/webhooks/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { url, events, active } = req.body as {
    url?: string
    events?: string[]
    active?: boolean
  }

  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } })
    if (!endpoint) { sendError(res, 404, 'NOT_FOUND', 'Webhook not found'); return }

    const workspace = await prisma.workspace.findUnique({ where: { id: endpoint.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const updates: { url?: string; events?: string[]; active?: boolean } = {}
    if (url !== undefined) updates.url = url.trim()
    if (events !== undefined) updates.events = events
    if (active !== undefined) updates.active = active

    const updated = await prisma.webhookEndpoint.update({ where: { id }, data: updates })
    res.json({
      endpoint: {
        ...updated,
        secret: `${updated.secret.slice(0, 6)}${'*'.repeat(updated.secret.length - 6)}`,
      },
    })
  } catch (err) {
    logger.error({ err }, 'Update webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update webhook')
  }
})

// DELETE /api/v1/webhooks/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } })
    if (!endpoint) { sendError(res, 404, 'NOT_FOUND', 'Webhook not found'); return }

    const workspace = await prisma.workspace.findUnique({ where: { id: endpoint.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await prisma.webhookEndpoint.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete webhook')
  }
})

// POST /api/v1/webhooks/:id/test
router.post('/:id/test', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } })
    if (!endpoint) { sendError(res, 404, 'NOT_FOUND', 'Webhook not found'); return }

    const workspace = await prisma.workspace.findUnique({ where: { id: endpoint.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await emitWebhook(endpoint.workspaceId, 'webhook.test', { message: 'Test event from OmniPulse' })
    res.json({ sent: true })
  } catch (err) {
    logger.error({ err }, 'Test webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send test event')
  }
})

export default router
