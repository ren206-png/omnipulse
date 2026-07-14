import { Router } from 'express'
import type { Request, Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { validateBody, validateQuery, urlField, webhookEventField, WEBHOOK_EVENTS, idField } from '../middleware/validate.js'
import { sendError } from '../lib/apiError.js'
import { emitWebhook } from '../lib/webhookEmitter.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

/** Max webhook endpoints per workspace — prevents DoS via endpoint flooding */
const MAX_ENDPOINTS_PER_WORKSPACE = 20

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ListWebhooksQuery = z.object({
  workspaceId: idField,
})

const CreateWebhookBody = z.object({
  workspaceId: idField,
  url: urlField,
  events: z
    .array(webhookEventField)
    .min(1, 'At least one event is required')
    .refine(
      (evs) => new Set(evs).size === evs.length,
      'Duplicate events are not allowed',
    ),
  active: z.boolean().optional().default(true),
})

const UpdateWebhookBody = z.object({
  url: urlField.optional(),
  events: z
    .array(webhookEventField)
    .min(1, 'At least one event is required')
    .optional(),
  active: z.boolean().optional(),
})

// ── Helper ────────────────────────────────────────────────────────────────────

async function assertOwner(workspaceId: string, userId: string, res: Response): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace || workspace.ownerId !== userId) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied')
    return false
  }
  return true
}

function maskSecret(secret: string): string {
  return `${secret.slice(0, 6)}${'*'.repeat(Math.max(0, secret.length - 6))}`
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/v1/webhooks?workspaceId=
router.get('/', validateQuery(ListWebhooksQuery), async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId: string }
  try {
    if (!await assertOwner(workspaceId, req.user!.id, res)) return
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ endpoints: endpoints.map((ep) => ({ ...ep, secret: maskSecret(ep.secret) })) })
  } catch (err) {
    logger.error({ err }, 'List webhooks error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list webhooks')
  }
})

// POST /api/v1/webhooks
router.post('/', validateBody(CreateWebhookBody), async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, url, events, active } = req.body as z.infer<typeof CreateWebhookBody>
  try {
    if (!await assertOwner(workspaceId, req.user!.id, res)) return

    // Rate-limit: cap endpoints per workspace
    const existing = await prisma.webhookEndpoint.count({ where: { workspaceId } })
    if (existing >= MAX_ENDPOINTS_PER_WORKSPACE) {
      sendError(res, 429, 'LIMIT_EXCEEDED', `Maximum ${MAX_ENDPOINTS_PER_WORKSPACE} webhook endpoints per workspace`)
      return
    }

    const secret = crypto.randomBytes(32).toString('hex')
    const endpoint = await prisma.webhookEndpoint.create({
      data: { workspaceId, url, secret, events, active },
    })

    // Return full secret once on creation — client must store it
    res.status(201).json({ endpoint })
  } catch (err) {
    logger.error({ err }, 'Create webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create webhook')
  }
})

// PATCH /api/v1/webhooks/:id
router.patch('/:id', validateBody(UpdateWebhookBody), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const updates = req.body as z.infer<typeof UpdateWebhookBody>
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } })
    if (!endpoint) { sendError(res, 404, 'NOT_FOUND', 'Webhook not found'); return }
    if (!await assertOwner(endpoint.workspaceId, req.user!.id, res)) return

    const updated = await prisma.webhookEndpoint.update({ where: { id }, data: updates })
    res.json({ endpoint: { ...updated, secret: maskSecret(updated.secret) } })
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
    if (!await assertOwner(endpoint.workspaceId, req.user!.id, res)) return
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
    if (!await assertOwner(endpoint.workspaceId, req.user!.id, res)) return
    await emitWebhook(endpoint.workspaceId, 'webhook.test', { message: 'Test event from OmniPulse' })
    res.json({ sent: true, supportedEvents: WEBHOOK_EVENTS })
  } catch (err) {
    logger.error({ err }, 'Test webhook error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send test event')
  }
})

export default router
