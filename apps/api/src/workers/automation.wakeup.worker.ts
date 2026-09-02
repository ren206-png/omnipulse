/**
 * Automation Engine — Wakeup Scheduler
 *
 * Runs every 30 seconds. Polls for:
 *
 *   A. WAITING_UNTIL instances whose wakeAt has passed.
 *      → Enqueues resume jobs so the execute worker continues them.
 *
 *   B. WAITING_FOR_INPUT instances whose timeout has expired (wakeAt passed).
 *      → Enqueues resume jobs (resume worker routes to 'timeout' edge).
 *
 *   C. PENDING outbox entries whose nextAttemptAt has passed (deferred by
 *      send-window policy or backoff).
 *      → Enqueues outbox jobs so the outbox worker retries them.
 *
 * Design: the scheduler does NOT execute the work itself — it only enqueues
 * jobs. This keeps it fast and avoids lock contention with the execute worker.
 *
 * Uses upsertJobScheduler so the repeating job survives process restarts
 * without duplication.
 */

import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { resumeQueue, outboxQueue } from '../automation/queues/index.js'
import { randomUUID } from 'node:crypto'

const WAKEUP_QUEUE   = 'automation-wakeup'
const WAKEUP_EVERY   = 30_000  // 30 seconds
const SWEEP_BATCH    = 100     // max instances per sweep

export const wakeupQueue = new Queue(WAKEUP_QUEUE, { connection: redisConnection })

let _worker: Worker | null = null

export async function startAutomationWakeupWorker(): Promise<void> {
  if (_worker) return

  // Register the repeating job (idempotent via upsertJobScheduler)
  await wakeupQueue.upsertJobScheduler(
    'automation-wakeup-tick',
    { every: WAKEUP_EVERY },
    { data: {} },
  )
  logger.info('[AutomationWakeup] Job scheduler registered (every 30s)')

  _worker = new Worker(
    WAKEUP_QUEUE,
    async () => {
      const now = new Date()
      const correlationId = randomUUID()
      let resumeEnqueued = 0
      let outboxEnqueued = 0

      // ── A + B. Timed-out instances (WAITING_UNTIL + WAITING_FOR_INPUT timeout) ──
      const timedOutInstances = await prisma.contactFlowInstance.findMany({
        where: {
          status:  { in: ['WAITING_UNTIL', 'WAITING_FOR_INPUT'] },
          wakeAt:  { lte: now },
        },
        select: { id: true, workspaceId: true, status: true },
        take:   SWEEP_BATCH,
        orderBy: { wakeAt: 'asc' },
      })

      for (const inst of timedOutInstances) {
        await resumeQueue.add(
          'resume',
          {
            instanceId:   inst.id,
            workspaceId:  inst.workspaceId,
            correlationId,
          },
          {
            // Idempotent: if a resume job is already queued for this wake cycle, skip
            jobId: `resume-wakeup-${inst.id}-${Math.floor(now.getTime() / WAKEUP_EVERY)}`,
          },
        )
        resumeEnqueued++
      }

      // ── C. Deferred outbox entries ─────────────────────────────────────────────
      const deferredOutbox = await prisma.automationOutbox.findMany({
        where: {
          status:         'PENDING',
          nextAttemptAt:  { lte: now },
        },
        select: { id: true, workspaceId: true },
        take:   SWEEP_BATCH,
        orderBy: { nextAttemptAt: 'asc' },
      })

      for (const entry of deferredOutbox) {
        await outboxQueue.add(
          'outbox',
          {
            outboxId:     entry.id,
            workspaceId:  entry.workspaceId,
            correlationId,
          },
          {
            jobId: `outbox-retry-${entry.id}-${Math.floor(now.getTime() / WAKEUP_EVERY)}`,
          },
        )
        outboxEnqueued++
      }

      if (resumeEnqueued > 0 || outboxEnqueued > 0) {
        logger.info(
          { resumeEnqueued, outboxEnqueued, correlationId },
          '[AutomationWakeup] Tick — jobs enqueued',
        )
      }
    },
    {
      connection:  redisConnection,
      concurrency: 1, // single-threaded sweep to avoid double-enqueue races
    },
  )

  _worker.on('ready', () => logger.info('[AutomationWakeup] Worker ready — sweeping every 30s'))
  _worker.on('error', (err) => logger.error({ err }, '[AutomationWakeup] Worker error'))
  _worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, '[AutomationWakeup] Tick failed'))
}

export { _worker as automationWakeupWorker }
