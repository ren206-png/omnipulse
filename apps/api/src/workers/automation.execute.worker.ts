/**
 * Automation Engine — Execute Worker
 *
 * Consumes jobs from `automation-execute`.
 * Each job processes one or more steps of a ContactFlowInstance.
 *
 * Protocol:
 *   1. Acquire distributed lock on the instance (30s TTL).
 *      If already locked → RetryableError (BullMQ retries with backoff).
 *   2. Call executeInstance() — runs up to MAX_STEPS_PER_JOB nodes.
 *   3. On CONTINUATION → re-enqueue self (next step batch).
 *   4. On WAITING_UNTIL → enqueue a delayed resume job via resumeQueue.
 *   5. On WAITING_FOR_INPUT → nothing; resume worker handles it on next event.
 *   6. Release lock (always).
 *
 * Concurrency: 5 — execution is DB-heavy; keep below Prisma connection pool.
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { ExecuteJobPayloadSchema, RetryableError } from '../automation/types/index.js'
import { executeInstance } from '../automation/services/executor.service.js'
import { distributedLock } from '../automation/services/redisLock.js'
import { instanceLockKey } from '../automation/services/distributedLock.js'
import { executeQueue, resumeQueue, EXECUTE_QUEUE } from '../automation/queues/index.js'

const LOCK_TTL_MS = 30_000 // 30 seconds

let _worker: Worker | null = null

export function startAutomationExecuteWorker(): void {
  if (_worker) return

  _worker = new Worker(
    EXECUTE_QUEUE,
    async (job) => {
      const parsed = ExecuteJobPayloadSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.error({ jobId: job.id }, '[AutomationExecute] Invalid payload — dropping')
        return
      }
      const { instanceId, workspaceId, inboundEventId, correlationId, attempt } = parsed.data

      // Acquire distributed lock
      const lockKey = instanceLockKey(instanceId)
      const token = await distributedLock.acquire(lockKey, LOCK_TTL_MS)
      if (!token) {
        throw new RetryableError(`[AutomationExecute] Instance "${instanceId}" is locked — will retry`)
      }

      try {
        const result = await executeInstance(prisma, {
          instanceId,
          workspaceId,
          inboundEventId,
          attempt,
        })

        logger.info(
          { instanceId, status: result.status, correlationId },
          '[AutomationExecute] Step complete',
        )

        switch (result.status) {
          case 'CONTINUATION': {
            // Re-enqueue immediately for the next batch of steps
            const nextAttempt = attempt + 1
            await executeQueue.add(
              'execute',
              { instanceId, workspaceId, inboundEventId, correlationId, attempt: nextAttempt },
              { jobId: `execute-${instanceId}-${nextAttempt}`, delay: 0 },
            )
            break
          }

          case 'WAITING_UNTIL': {
            if (result.wakeAt) {
              const delayMs = Math.max(0, result.wakeAt.getTime() - Date.now())
              await resumeQueue.add(
                'resume',
                { instanceId, workspaceId, correlationId },
                {
                  jobId: `resume-${instanceId}-${result.wakeAt.getTime()}`,
                  delay: delayMs,
                },
              )
              logger.info(
                { instanceId, wakeAt: result.wakeAt, delayMs },
                '[AutomationExecute] WAITING_UNTIL — resume job scheduled',
              )
            }
            break
          }

          case 'WAITING_FOR_INPUT':
            // No action — the resume worker triggers on the next inbound event
            logger.info({ instanceId }, '[AutomationExecute] WAITING_FOR_INPUT — paused')
            break

          case 'COMPLETED':
            logger.info({ instanceId, correlationId }, '[AutomationExecute] Instance COMPLETED')
            break

          case 'FAILED':
            logger.warn({ instanceId, reason: result.reason }, '[AutomationExecute] Instance FAILED')
            break
        }
      } finally {
        await distributedLock.release(lockKey, token)
      }
    },
    {
      connection:  redisConnection,
      concurrency: 5,
    },
  )

  _worker.on('ready', () => logger.info(`[AutomationExecute] Worker ready — queue: ${EXECUTE_QUEUE}`))

  _worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[AutomationExecute] Job failed')
  })
}

export { _worker as automationExecuteWorker }
