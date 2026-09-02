/**
 * Automation Engine — Outbox Worker
 *
 * Consumes jobs from `automation-outbox`.
 * Each job delivers one AutomationOutbox entry to a channel adapter.
 *
 * The outbox processor handles:
 *   • Optimistic claim (skip if already claimed/sent by another worker)
 *   • Send window policy (defer to nextAttemptAt if outside quiet hours)
 *   • Channel adapter dispatch (STUB / Meta)
 *   • Exponential backoff on RetryableError
 *   • Terminal failure marking on TerminalError
 *
 * Concurrency: 20 — outbox delivery is I/O-bound (HTTP to Meta API).
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { OutboxJobPayloadSchema } from '../automation/types/index.js'
import { processOutboxEntry } from '../automation/services/outboxProcessor.service.js'
import { OUTBOX_QUEUE } from '../automation/queues/index.js'

let _worker: Worker | null = null

export function startAutomationOutboxWorker(): void {
  if (_worker) return

  _worker = new Worker(
    OUTBOX_QUEUE,
    async (job) => {
      const parsed = OutboxJobPayloadSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.error({ jobId: job.id }, '[AutomationOutbox] Invalid payload — dropping')
        return
      }
      const { outboxId, workspaceId, correlationId } = parsed.data

      const result = await processOutboxEntry(prisma, {
        outboxId,
        workspaceId,
      })

      logger.info(
        { outboxId, outcome: result.outcome, correlationId },
        '[AutomationOutbox] Entry processed',
      )

      if (result.outcome === 'DEFERRED' && result.retryAt) {
        logger.info(
          { outboxId, retryAt: result.retryAt },
          '[AutomationOutbox] Message deferred (outside send window)',
        )
        // BullMQ will not automatically retry a DEFERRED job — the wakeup
        // scheduler will re-enqueue it when the window opens.
      }
    },
    {
      connection:  redisConnection,
      concurrency: 20,
    },
  )

  _worker.on('ready', () => logger.info(`[AutomationOutbox] Worker ready — queue: ${OUTBOX_QUEUE}`))

  _worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[AutomationOutbox] Job failed')
  })
}

export { _worker as automationOutboxWorker }
