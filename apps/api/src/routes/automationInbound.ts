/**
 * Automation Engine — Inbound Webhook Route
 *
 * POST /api/v1/automation/inbound
 *
 * Receives a normalized inbound event (typically from a platform webhook
 * adapter or internal service), verifies an HMAC-SHA256 signature, and
 * hands off to the trigger coordinator.
 *
 * Signature verification:
 *   Header: X-Automation-Signature: sha256=<hex>
 *   Secret: process.env.AUTOMATION_WEBHOOK_SECRET
 *   Payload: raw request body (JSON string)
 *
 * The body must conform to NormalizedInboundEventSchema.
 * Returns 200 { ok: true } on success (even if no flows matched — don't
 * reveal internal state to callers).
 *
 * For local dev / tests, signature verification can be skipped by setting
 * AUTOMATION_SKIP_SIG_VERIFY=true.
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sendError } from '../lib/apiError.js'
import { prisma } from '../lib/prisma.js'
import { NormalizedInboundEventSchema } from '../automation/types/index.js'
import { coordinateTrigger } from '../automation/services/triggerCoordinator.service.js'
import { AutomationDisabledError, ContactOptedOutError } from '../automation/services/globalGuards.js'
import { logger } from '../lib/logger.js'

const router = Router()

// ── HMAC signature verification ───────────────────────────────────────────────

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (process.env.AUTOMATION_SKIP_SIG_VERIFY === 'true') return true
  if (!signature) return false

  const secret = process.env.AUTOMATION_WEBHOOK_SECRET
  if (!secret) {
    logger.warn('AUTOMATION_WEBHOOK_SECRET is not set — rejecting inbound event')
    return false
  }

  // Compute HMAC over the raw request bytes (not re-serialised JSON) to match
  // exactly what the sender signed — avoids key-order / whitespace drift.
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false // length mismatch → not equal
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  // Feature flag
  if (process.env.AUTOMATION_ENGINE_ENABLED !== 'true') {
    sendError(res, 503, 'AUTOMATION_DISABLED', 'Automation engine is not enabled')
    return
  }

  // req.body is a raw Buffer because express.raw() is mounted for this path in index.ts.
  // Verify HMAC first (over the original bytes), then parse JSON manually.
  const rawBody = req.body as Buffer
  const signature = req.headers['x-automation-signature'] as string | undefined

  if (!verifySignature(rawBody, signature)) {
    sendError(res, 401, 'INVALID_SIGNATURE', 'Request signature is missing or invalid')
    return
  }

  // Parse JSON from the raw buffer
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody.toString('utf8'))
  } catch {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON')
    return
  }

  // Validate body shape
  const parsed = NormalizedInboundEventSchema.safeParse(parsedJson)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    return
  }

  const event = parsed.data

  try {
    const result = await coordinateTrigger(prisma, event)
    res.json({ ok: true, isDuplicate: result.isDuplicate, enqueuedCount: result.enqueuedCount })
  } catch (err) {
    if (err instanceof AutomationDisabledError || err instanceof ContactOptedOutError) {
      // Silently accept — don't reveal internal state
      res.json({ ok: true, isDuplicate: false, enqueuedCount: 0 })
      return
    }
    // Unexpected error — log and return 500
    logger.error({ err }, 'Unexpected error in automation inbound route')
    sendError(res, 500, 'INTERNAL_ERROR', 'An internal error occurred processing the event')
  }
})

export default router
