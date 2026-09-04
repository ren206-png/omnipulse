/**
 * Automation Engine — Outbox Processor
 *
 * Claims and delivers a single AutomationOutbox entry.
 *
 * Protocol:
 *   1. Claim the outbox record: UPDATE SET status='CLAIMED' WHERE status='PENDING'
 *      (optimistic — if another worker claimed it first, count=0 → skip)
 *   2. Load the contact's channelUserId for addressing.
 *   3. Check send window policy — if outside window, reschedule and bail.
 *   4. Dispatch to the correct channel adapter.
 *   5a. On success: mark SENT.
 *   5b. On RetryableError: increment attempts, reset to PENDING with nextAttemptAt backoff.
 *   5c. On TerminalError: mark FAILED.
 *
 * The BullMQ worker retries at the job level too, but we also manage retries
 * at the outbox level so we can persist attempt counts across worker restarts.
 */

import type { PrismaClient } from '../../../generated/prisma/client.js'
import type { IChannelAdapter, SendMessagePayload } from '../adapters/IChannelAdapter.js'
import { RetryableError, TerminalError } from '../types/index.js'
import { checkSendWindow, type SendWindowConfig } from './sendWindowPolicy.js'

export interface ProcessOutboxOptions {
  outboxId:    string
  workspaceId: string
  /** Injected for testability. Defaults to channelAdapterRegistry.get(channel). */
  getAdapter?: (channel: string) => IChannelAdapter
  /** Injected window config (defaults to undefined → uses default window). */
  windowConfig?: SendWindowConfig
  /** Injected "now" for deterministic tests. Defaults to new Date(). */
  now?: Date
}

export interface OutboxProcessResult {
  outcome: 'SENT' | 'DEFERRED' | 'FAILED' | 'SKIPPED'
  retryAt?: Date
  reason?:  string
}

const MAX_OUTBOX_ATTEMPTS = 10
const BACKOFF_SECONDS     = [30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, 28800] // exponential

export async function processOutboxEntry(
  prisma: PrismaClient,
  opts: ProcessOutboxOptions,
): Promise<OutboxProcessResult> {
  const { outboxId, workspaceId, getAdapter, windowConfig, now = new Date() } = opts

  // ── 1. Claim ────────────────────────────────────────────────────────────────
  const claimed = await prisma.automationOutbox.updateMany({
    where: { id: outboxId, workspaceId, status: 'PENDING' },
    data:  { status: 'CLAIMED' },
  })

  if (claimed.count === 0) {
    // Already claimed or delivered by another worker
    return { outcome: 'SKIPPED', reason: 'Already claimed' }
  }

  // Load full record
  const outbox = await prisma.automationOutbox.findUnique({ where: { id: outboxId } })
  if (!outbox) return { outcome: 'SKIPPED', reason: 'Record not found after claim' }

  // ── 2. Load contact ─────────────────────────────────────────────────────────
  const payload = outbox.payload as Record<string, unknown>
  const contactId = payload['contactId'] as string | undefined
  if (!contactId) {
    await markFailed(prisma, outboxId, 'Missing contactId in outbox payload')
    return { outcome: 'FAILED', reason: 'Missing contactId' }
  }

  const contact = await prisma.automationContact.findUnique({
    where:  { id: contactId },
    select: { channelUserId: true, channel: true },
  })
  if (!contact) {
    await markFailed(prisma, outboxId, `Contact "${contactId}" not found`)
    return { outcome: 'FAILED', reason: 'Contact not found' }
  }

  // ── 3. Send window check ───────────────────────────────────────────────────
  const window = checkSendWindow(now, windowConfig)
  if (!window.allowed) {
    await prisma.automationOutbox.update({
      where: { id: outboxId },
      data:  {
        status:       'PENDING',
        nextAttemptAt: window.retryAt,
      },
    })
    return { outcome: 'DEFERRED', retryAt: window.retryAt }
  }

  // ── 4. Dispatch ────────────────────────────────────────────────────────────
  let adapter: IChannelAdapter
  try {
    if (getAdapter) {
      adapter = getAdapter(contact.channel)
    } else {
      const { channelAdapterRegistry } = await import('../adapters/channelAdapterRegistry.js')
      adapter = channelAdapterRegistry.get(contact.channel)
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    await markFailed(prisma, outboxId, reason)
    return { outcome: 'FAILED', reason }
  }

  const sendPayload: SendMessagePayload = {
    contactId,
    channelUserId: contact.channelUserId,
    text:          (payload['text'] as string) ?? '',
    quickReplies:  (payload['quickReplies'] as SendMessagePayload['quickReplies']) ?? [],
    typingDelayMs: (payload['typingDelayMs'] as number) ?? 0,
  }

  try {
    await adapter.send(sendPayload)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)

    if (err instanceof TerminalError) {
      await markFailed(prisma, outboxId, reason)
      return { outcome: 'FAILED', reason }
    }

    // RetryableError or unexpected — back-off and retry
    const currentAttempts = outbox.attempts + 1
    if (currentAttempts >= MAX_OUTBOX_ATTEMPTS) {
      await markFailed(prisma, outboxId, `Max attempts (${MAX_OUTBOX_ATTEMPTS}) reached: ${reason}`)
      return { outcome: 'FAILED', reason }
    }

    const delaySec = BACKOFF_SECONDS[Math.min(currentAttempts - 1, BACKOFF_SECONDS.length - 1)]
    const retryAt  = new Date(Date.now() + delaySec * 1_000)
    await prisma.automationOutbox.update({
      where: { id: outboxId },
      data: {
        status:        'PENDING',
        attempts:      currentAttempts,
        nextAttemptAt: retryAt,
      },
    })

    if (err instanceof RetryableError) throw err   // let BullMQ retry the job too
    throw new RetryableError(reason, err)
  }

  // ── 5a. Success ────────────────────────────────────────────────────────────
  await prisma.automationOutbox.update({
    where: { id: outboxId },
    data:  { status: 'SENT' },
  })
  return { outcome: 'SENT' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markFailed(prisma: PrismaClient, outboxId: string, reason: string): Promise<void> {
  await prisma.automationOutbox.update({
    where: { id: outboxId },
    data:  {
      status:  'FAILED',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { failureReason: reason } as any,
    },
  })
}
