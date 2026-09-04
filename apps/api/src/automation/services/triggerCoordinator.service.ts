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

import type { PrismaClient } from '../../../generated/prisma/client.js'
import { randomUUID } from 'node:crypto'
import type { NormalizedInboundEvent, TriggerJobPayload, ResumeJobPayload } from '../types/index.js'
import { assertWorkspaceAutomationEnabled, assertContactNotOptedOut } from './globalGuards.js'
import { ingestEvent } from './ingestion.service.js'
import { matchTriggers, type MatchedFlow } from './triggerMatcher.service.js'

export interface CoordinatorResult {
  /** Whether this event was a duplicate (already seen idempotency key). */
  isDuplicate: boolean
  /** Number of trigger jobs enqueued (0 = no matching flows). */
  enqueuedCount: number
  /** Number of resume jobs enqueued for WAITING_FOR_INPUT instances. */
  resumedCount: number
}

/**
 * Enqueue function signature — lets callers inject a stub for tests or a
 * real BullMQ Queue.addBulk for production.
 */
export type EnqueueFn = (jobs: Array<{ name: string; data: TriggerJobPayload; opts?: { jobId?: string } }>) => Promise<unknown>
export type ResumeFn  = (jobs: Array<{ name: string; data: ResumeJobPayload; opts?: { jobId?: string } }>) => Promise<unknown>

/**
 * Default enqueue implementation — lazily imports the queue to avoid
 * Redis connection at module load time in test environments.
 */
async function defaultEnqueue(jobs: Array<{ name: string; data: TriggerJobPayload; opts?: { jobId?: string } }>): Promise<unknown> {
  const { triggerQueue } = await import('../queues/index.js')
  return triggerQueue.addBulk(jobs)
}

async function defaultResume(jobs: Array<{ name: string; data: ResumeJobPayload; opts?: { jobId?: string } }>): Promise<unknown> {
  const { resumeQueue } = await import('../queues/index.js')
  return resumeQueue.addBulk(jobs)
}

export async function coordinateTrigger(
  prisma: PrismaClient,
  event: NormalizedInboundEvent,
  enqueue: EnqueueFn = defaultEnqueue,
  resume: ResumeFn   = defaultResume,
): Promise<CoordinatorResult> {
  // ── 1. Workspace + global flag guard ─────────────────────────────────────
  await assertWorkspaceAutomationEnabled(prisma, event.workspaceId)

  // ── 2. Ingest event (upsert contact, idempotent event write) ─────────────
  const { event: stored, contact, isDuplicate } = await ingestEvent(prisma, event)

  // ── 3. Duplicate → mark IGNORED and bail ─────────────────────────────────
  if (isDuplicate) {
    return { isDuplicate: true, enqueuedCount: 0, resumedCount: 0 }
  }

  // ── 4. Opt-out guard ──────────────────────────────────────────────────────
  try {
    await assertContactNotOptedOut(prisma, contact.id)
  } catch {
    await prisma.inboundAutomationEvent.update({
      where: { id: stored.id },
      data:  { processingStatus: 'IGNORED' },
    })
    return { isDuplicate: false, enqueuedCount: 0, resumedCount: 0 }
  }

  const correlationId = randomUUID()

  // ── 5a. Resume any WAITING_FOR_INPUT instances for this contact ────────────
  // Before matching new triggers, check if the contact has paused instances
  // waiting for their next message. If so, resume them with this event.
  const waitingInstances = await prisma.contactFlowInstance.findMany({
    where: {
      workspaceId: event.workspaceId,
      contactId:   contact.id,
      status:      'WAITING_FOR_INPUT',
    },
    select: { id: true, workspaceId: true },
  })

  let resumedCount = 0
  if (waitingInstances.length > 0) {
    await resume(
      waitingInstances.map((inst) => ({
        name: 'resume',
        data: {
          instanceId:     inst.id,
          workspaceId:    inst.workspaceId,
          inboundEventId: stored.id,
          correlationId,
        },
        opts: { jobId: `resume-input-${inst.id}-${stored.id}` },
      })),
    )
    resumedCount = waitingInstances.length
  }

  // ── 5b. Match new triggers ─────────────────────────────────────────────────
  const matches = await matchTriggers(prisma, event)

  // ── 6. No new matches and no resumed instances → mark IGNORED ─────────────
  if (matches.length === 0 && resumedCount === 0) {
    await prisma.inboundAutomationEvent.update({
      where: { id: stored.id },
      data:  { processingStatus: 'IGNORED' },
    })
    return { isDuplicate: false, enqueuedCount: 0, resumedCount: 0 }
  }

  // ── 7. Enqueue one trigger job per matched flow ────────────────────────────
  if (matches.length > 0) {
    await enqueue(
      matches.map((match: MatchedFlow) => ({
        name: 'trigger',
        data: {
          eventId:      stored.id,
          workspaceId:  event.workspaceId,
          correlationId,
        },
        opts: {
          jobId: `trigger-${stored.id}-${match.flowVersionId}`,
        },
      })),
    )
  }

  // ── 8. Mark event PROCESSED ────────────────────────────────────────────────
  await prisma.inboundAutomationEvent.update({
    where: { id: stored.id },
    data:  { processingStatus: 'PROCESSED' },
  })

  return { isDuplicate: false, enqueuedCount: matches.length, resumedCount }
}
