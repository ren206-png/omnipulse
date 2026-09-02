/**
 * Automation Engine — Trigger Coordinator
 *
 * The single entry point for processing an inbound event end-to-end through
 * the trigger pipeline:
 *
 *   1. assertWorkspaceAutomationEnabled   — global feature flag + per-workspace flag
 *   2. ingestEvent                        — upsert contact, idempotent event store
 *   3. If duplicate → mark IGNORED, return early
 *   4. assertContactNotOptedOut           — respect opt-out
 *   5. matchTriggers                      — find matching PUBLISHED flows
 *   6. If no matches → mark IGNORED, return early
 *   7. Enqueue one TriggerJob per matched flow → BullMQ
 *   8. Mark event PROCESSED
 *
 * Errors:
 *   AutomationDisabledError / ContactOptedOutError — caller should swallow.
 *   Any other error propagates (will be caught by BullMQ worker retry logic).
 */

import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { NormalizedInboundEvent, TriggerJobPayload } from '../types/index.js'
import { assertWorkspaceAutomationEnabled, assertContactNotOptedOut } from './globalGuards.js'
import { ingestEvent } from './ingestion.service.js'
import { matchTriggers, type MatchedFlow } from './triggerMatcher.service.js'

export interface CoordinatorResult {
  /** Whether this event was a duplicate (already seen idempotency key). */
  isDuplicate: boolean
  /** Number of trigger jobs enqueued (0 = no matching flows). */
  enqueuedCount: number
}

/**
 * Enqueue function signature — lets callers inject a stub for tests or a
 * real BullMQ Queue.addBulk for production.
 */
export type EnqueueFn = (jobs: Array<{ name: string; data: TriggerJobPayload; opts?: { jobId?: string } }>) => Promise<unknown>

/**
 * Default enqueue implementation — lazily imports the queue to avoid
 * Redis connection at module load time in test environments.
 */
async function defaultEnqueue(jobs: Array<{ name: string; data: TriggerJobPayload; opts?: { jobId?: string } }>): Promise<unknown> {
  const { triggerQueue } = await import('../queues/index.js')
  return triggerQueue.addBulk(jobs)
}

export async function coordinateTrigger(
  prisma: PrismaClient,
  event: NormalizedInboundEvent,
  enqueue: EnqueueFn = defaultEnqueue,
): Promise<CoordinatorResult> {
  // ── 1. Workspace + global flag guard ─────────────────────────────────────
  await assertWorkspaceAutomationEnabled(prisma, event.workspaceId)

  // ── 2. Ingest event (upsert contact, idempotent event write) ─────────────
  const { event: stored, contact, isDuplicate } = await ingestEvent(prisma, event)

  // ── 3. Duplicate → mark IGNORED and bail ─────────────────────────────────
  if (isDuplicate) {
    return { isDuplicate: true, enqueuedCount: 0 }
  }

  // ── 4. Opt-out guard ──────────────────────────────────────────────────────
  try {
    await assertContactNotOptedOut(prisma, contact.id)
  } catch {
    await prisma.inboundAutomationEvent.update({
      where: { id: stored.id },
      data:  { processingStatus: 'IGNORED' },
    })
    return { isDuplicate: false, enqueuedCount: 0 }
  }

  // ── 5. Match triggers ──────────────────────────────────────────────────────
  const matches = await matchTriggers(prisma, event)

  // ── 6. No matches → mark IGNORED ──────────────────────────────────────────
  if (matches.length === 0) {
    await prisma.inboundAutomationEvent.update({
      where: { id: stored.id },
      data:  { processingStatus: 'IGNORED' },
    })
    return { isDuplicate: false, enqueuedCount: 0 }
  }

  // ── 7. Enqueue one trigger job per matched flow ────────────────────────────
  const correlationId = randomUUID()
  await enqueue(
    matches.map((match: MatchedFlow) => ({
      name: 'trigger',
      data: {
        eventId:      stored.id,
        workspaceId:  event.workspaceId,
        correlationId,
      },
      opts: {
        // Deduplicate: same event + flow won't be double-enqueued.
        jobId: `trigger-${stored.id}-${match.flowVersionId}`,
      },
    })),
  )

  // ── 8. Mark event PROCESSED ────────────────────────────────────────────────
  await prisma.inboundAutomationEvent.update({
    where: { id: stored.id },
    data:  { processingStatus: 'PROCESSED' },
  })

  return { isDuplicate: false, enqueuedCount: matches.length }
}
