/**
 * Automation Engine — Resume Worker
 *
 * Consumes jobs from `automation-resume`.
 * Jobs arrive in two cases:
 *   A. Delayed wakeup — enqueued by the execute worker after WAITING_UNTIL.
 *      The instance woke up due to a timer; follow the 'default' (or 'timeout')
 *      edge depending on how the WAIT was configured.
 *   B. Input received — enqueued by the trigger coordinator when a new inbound
 *      event arrives for a contact with a WAITING_FOR_INPUT instance.
 *
 * Protocol:
 *   1. Load instance; skip if not in a WAITING_* status.
 *   2. Transition status → RUNNING.
 *   3. For WAITING_FOR_INPUT: if the wakeAt has passed → follow 'timeout' edge.
 *      Otherwise → follow 'default' edge (the WAIT node's outgoing default).
 *   4. Enqueue execute job.
 *
 * Concurrency: 10 — resume is lightweight (status flip + queue write).
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { ResumeJobPayloadSchema } from '../automation/types/index.js'
import { patchInstance } from '../automation/services/instanceManager.service.js'
import { executeQueue, RESUME_QUEUE } from '../automation/queues/index.js'

let _worker: Worker | null = null

export function startAutomationResumeWorker(): void {
  if (_worker) return

  _worker = new Worker(
    RESUME_QUEUE,
    async (job) => {
      const parsed = ResumeJobPayloadSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.error({ jobId: job.id }, '[AutomationResume] Invalid payload — dropping')
        return
      }
      const { instanceId, workspaceId, inboundEventId, correlationId } = parsed.data

      // Load instance
      const instance = await prisma.contactFlowInstance.findUnique({
        where:  { id: instanceId },
        select: { id: true, status: true, wakeAt: true, revision: true, currentNodeId: true, flowVersionId: true },
      })

      if (!instance) {
        logger.warn({ instanceId }, '[AutomationResume] Instance not found — dropping')
        return
      }

      if (instance.status !== 'WAITING_FOR_INPUT' && instance.status !== 'WAITING_UNTIL') {
        logger.info(
          { instanceId, status: instance.status },
          '[AutomationResume] Instance not in a waiting state — skipping',
        )
        return
      }

      // Determine if this is a timeout (wakeAt has passed and no new input)
      const isTimeout =
        instance.status === 'WAITING_FOR_INPUT' &&
        instance.wakeAt !== null &&
        instance.wakeAt <= new Date() &&
        !inboundEventId // no new input event supplied

      if (isTimeout && instance.currentNodeId) {
        // Check if a 'timeout' edge exists from the current WAIT node
        const timeoutEdge = await prisma.flowEdge.findFirst({
          where: { sourceNodeId: instance.currentNodeId, label: 'timeout' },
          select: { targetNodeId: true },
        })

        if (timeoutEdge) {
          // Advance to the timeout branch node before re-queuing
          await patchInstance(prisma, instanceId, instance.revision, {
            status:        'RUNNING',
            wakeAt:        null,
            currentNodeId: timeoutEdge.targetNodeId,
          })
          logger.info({ instanceId }, '[AutomationResume] Timeout — following timeout edge')
        } else {
          // No timeout edge → simply resume at the same WAIT node (will re-evaluate)
          await patchInstance(prisma, instanceId, instance.revision, {
            status: 'RUNNING',
            wakeAt: null,
          })
        }
      } else {
        // Normal resume (timer fired for WAITING_UNTIL, or new input for WAITING_FOR_INPUT)
        await patchInstance(prisma, instanceId, instance.revision, {
          status: 'RUNNING',
          wakeAt: null,
        })
      }

      // Enqueue execute to continue from wherever the instance is now
      const attempt = 1
      await executeQueue.add(
        'execute',
        {
          instanceId,
          workspaceId,
          inboundEventId,
          correlationId,
          attempt,
        },
        { jobId: `execute-${instanceId}-resume-${Date.now()}` },
      )

      logger.info(
        { instanceId, inboundEventId, isTimeout, correlationId },
        '[AutomationResume] Instance resumed → execute job enqueued',
      )
    },
    {
      connection:  redisConnection,
      concurrency: 10,
    },
  )

  _worker.on('ready', () => logger.info(`[AutomationResume] Worker ready — queue: ${RESUME_QUEUE}`))

  _worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[AutomationResume] Job failed')
  })
}

export { _worker as automationResumeWorker }
