/**
 * Automation Engine — Trigger Worker
 *
 * Consumes jobs from `automation-trigger`.
 * Each job was enqueued by coordinateTrigger() after an inbound event matched
 * one or more PUBLISHED flow versions.
 *
 * Responsibilities:
 *   1. Load the matched flow version from the job payload.
 *   2. Enforce reentry policy and create a ContactFlowInstance (or skip).
 *   3. Enqueue one `automation-execute` job for the new instance.
 *
 * Concurrency: 10 — trigger fan-out is cheap (DB read + insert + queue write).
 */

import 'dotenv/config'
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { TriggerJobPayloadSchema, RetryableError } from '../automation/types/index.js'
import { createInstance } from '../automation/services/instanceManager.service.js'
import { executeQueue, TRIGGER_QUEUE, EXECUTE_QUEUE } from '../automation/queues/index.js'

let _worker: Worker | null = null

export function startAutomationTriggerWorker(): void {
  if (_worker) return

  _worker = new Worker(
    TRIGGER_QUEUE,
    async (job) => {
      // Validate payload
      const parsed = TriggerJobPayloadSchema.safeParse(job.data)
      if (!parsed.success) {
        logger.error({ jobId: job.id, data: job.data }, '[AutomationTrigger] Invalid job payload — dropping')
        return // non-retryable: bad payload
      }
      const { eventId, workspaceId, correlationId } = parsed.data

      // Load the inbound event to get contact + flow version info
      const event = await prisma.inboundAutomationEvent.findUnique({
        where:  { id: eventId },
        select: {
          id:         true,
          contactId:  true,
          workspaceId: true,
        },
      })
      if (!event) {
        logger.warn({ eventId }, '[AutomationTrigger] Event not found — dropping job')
        return
      }
      if (!event.contactId) {
        logger.warn({ eventId }, '[AutomationTrigger] Event has no contactId — dropping job')
        return
      }

      // The job was created with jobId = `trigger-{eventId}-{flowVersionId}`
      // Extract flowVersionId from the BullMQ job id.
      const jobId = job.id ?? ''
      const flowVersionId = jobId.replace(`trigger-${eventId}-`, '')

      if (!flowVersionId || flowVersionId === jobId) {
        logger.error({ jobId }, '[AutomationTrigger] Cannot extract flowVersionId from jobId — dropping')
        return
      }

      // Load flow version
      const version = await prisma.automationFlowVersion.findUnique({
        where:  { id: flowVersionId },
        select: { id: true, flowId: true, entryNodeKey: true, flow: { select: { priority: true } } },
      })
      if (!version) {
        logger.warn({ flowVersionId }, '[AutomationTrigger] Flow version not found — dropping')
        return
      }

      // Create instance (reentry policy enforced inside)
      const instance = await createInstance(prisma, {
        workspaceId,
        contactId: event.contactId,
        inboundEventId: event.id,
        flow: {
          flowId:        version.flowId,
          flowVersionId: version.id,
          entryNodeKey:  version.entryNodeKey,
          priority:      version.flow.priority,
        },
      })

      if (!instance) {
        logger.info(
          { flowVersionId, contactId: event.contactId },
          '[AutomationTrigger] Instance creation skipped by reentry policy',
        )
        return
      }

      // Enqueue execute job
      await executeQueue.add(
        'execute',
        {
          instanceId:     instance.id,
          workspaceId,
          inboundEventId: event.id,
          correlationId,
          attempt:        1,
        },
        {
          jobId: `execute-${instance.id}-1`,
        },
      )

      logger.info(
        { instanceId: instance.id, flowVersionId, correlationId },
        '[AutomationTrigger] Instance created → execute job enqueued',
      )
    },
    {
      connection:  redisConnection,
      concurrency: 10,
    },
  )

  _worker.on('ready', () => logger.info(`[AutomationTrigger] Worker ready — queue: ${TRIGGER_QUEUE}`))

  _worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      '[AutomationTrigger] Job failed',
    )
  })
}

export { _worker as automationTriggerWorker }
