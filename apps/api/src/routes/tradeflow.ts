import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { FF_TRADEFLOW_BRIDGE } from '../lib/featureFlags.js'
import { TradeFlowAdapter } from '../integrations/tradeflow/TradeFlowAdapter.js'

const router = Router()
const db = prisma as any

const tradeFlowAdapter = new TradeFlowAdapter(process.env.TRADEFLOW_WEBHOOK_SECRET ?? '')

async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return 'OWNER'

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return (membership?.role as 'ADMIN' | 'MEMBER') ?? null
}

// POST /api/v1/tradeflow/webhook — inbound job events from TradeFlow (no auth, raw body)
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  if (!FF_TRADEFLOW_BRIDGE) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  const signature = req.headers['x-tradeflow-signature'] as string | undefined
  const timestamp = req.headers['x-tradeflow-timestamp'] as string | undefined

  if (!signature || !timestamp) {
    res.status(400).json({ error: 'MISSING_HEADERS' })
    return
  }

  let event
  try {
    event = await tradeFlowAdapter.verifyAndParse(req.body as Buffer, signature, timestamp)
  } catch (err) {
    logger.warn({ err }, 'TradeFlow webhook verification failed')
    res.status(400).json({ error: 'INVALID_WEBHOOK' })
    return
  }

  try {
    // Look up tenant mapping by tradeFlowAccountId — silent drop if not found or inactive
    const mapping = await db.tradeFlowTenantMapping.findUnique({
      where: { tradeFlowAccountId: event.tradeFlowAccountId },
    })
    if (!mapping || !mapping.active) {
      // Silent 200 — don't leak whether the account is mapped
      res.status(200).json({ ok: true })
      return
    }

    // Nonce: replay protection at the storage layer
    const nonce = `${event.tradeFlowAccountId}:${event.jobId}:${event.eventType}:${timestamp}`

    try {
      await db.ingestedJobEvent.create({
        data: {
          workspaceId: mapping.workspaceId,
          tradeFlowAccountId: event.tradeFlowAccountId,
          eventType: event.eventType,
          jobId: event.jobId,
          jobType: event.jobType ?? null,
          city: event.city ?? null,
          rawPayload: event.rawPayload,
          nonce,
        },
      })
    } catch (err: any) {
      // Unique constraint violation on nonce = duplicate delivery, treat as success
      if (err?.code === 'P2002') {
        res.status(200).json({ ok: true })
        return
      }
      throw err
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'TradeFlow webhook processing error')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// All link routes require auth
router.use(requireAuth)

// GET /api/v1/tradeflow/link?workspaceId= — get current tenant mapping
router.get('/link', async (req: Request, res: Response): Promise<void> => {
  if (!FF_TRADEFLOW_BRIDGE) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }

  try {
    const role = await getWorkspaceRole(workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const mapping = await db.tradeFlowTenantMapping.findUnique({
      where: { workspaceId },
    })
    res.json({ mapping: mapping ?? null })
  } catch (err) {
    logger.error({ err }, 'GET /tradeflow/link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal error')
  }
})

// POST /api/v1/tradeflow/link — create tenant mapping (owner only)
router.post('/link', async (req: Request, res: Response): Promise<void> => {
  if (!FF_TRADEFLOW_BRIDGE) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  const { workspaceId, tradeFlowAccountId } = req.body as {
    workspaceId?: string
    tradeFlowAccountId?: string
  }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  if (!tradeFlowAccountId) { sendError(res, 400, 'MISSING_TRADEFLOW_ACCOUNT', 'tradeFlowAccountId required'); return }

  try {
    const role = await getWorkspaceRole(workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    if (role !== 'OWNER') { sendError(res, 403, 'FORBIDDEN', 'Only workspace owners can link TradeFlow accounts'); return }

    const mapping = await db.tradeFlowTenantMapping.create({
      data: {
        workspaceId,
        tradeFlowAccountId,
        linkedBy: req.user!.id,
      },
    })
    res.status(201).json({ mapping })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      sendError(res, 409, 'ALREADY_LINKED', 'This workspace or TradeFlow account is already linked')
      return
    }
    logger.error({ err }, 'POST /tradeflow/link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal error')
  }
})

// DELETE /api/v1/tradeflow/link?workspaceId= — soft-delete mapping (owner only)
router.delete('/link', async (req: Request, res: Response): Promise<void> => {
  if (!FF_TRADEFLOW_BRIDGE) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }

  try {
    const role = await getWorkspaceRole(workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    if (role !== 'OWNER') { sendError(res, 403, 'FORBIDDEN', 'Only workspace owners can unlink TradeFlow accounts'); return }

    const existing = await db.tradeFlowTenantMapping.findUnique({ where: { workspaceId } })
    if (!existing) { sendError(res, 404, 'NOT_FOUND', 'No TradeFlow mapping found for this workspace'); return }

    const mapping = await db.tradeFlowTenantMapping.update({
      where: { workspaceId },
      data: { active: false },
    })
    res.json({ mapping })
  } catch (err) {
    logger.error({ err }, 'DELETE /tradeflow/link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal error')
  }
})

export default router
