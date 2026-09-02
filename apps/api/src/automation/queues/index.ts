/**
 * Automation Engine — BullMQ Queue Definitions
 *
 * Three queues, all using the shared Redis connection from lib/queue.ts:
 *   automation:trigger  — fan-out: one job per matched flow version.
 *   automation:execute  — single-step execution of a flow instance.
 *   automation:outbox   — deliver a message from the outbox to a channel adapter.
 *
 * Import the queue objects to enqueue; import the queue names to reference
 * in Worker constructors.
 */

import { Queue } from 'bullmq'
import { redisConnection } from '../../lib/queue.js'
import type { TriggerJobPayload, ExecuteJobPayload, OutboxJobPayload, ResumeJobPayload } from '../types/index.js'

export const TRIGGER_QUEUE  = 'automation-trigger'
export const EXECUTE_QUEUE  = 'automation-execute'
export const OUTBOX_QUEUE   = 'automation-outbox'
export const RESUME_QUEUE   = 'automation-resume'

export const triggerQueue = new Queue<TriggerJobPayload>(TRIGGER_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail:    { count: 5_000 },
  },
})

export const executeQueue = new Queue<ExecuteJobPayload>(EXECUTE_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 5_000 },
    removeOnFail:    { count: 10_000 },
  },
})

export const outboxQueue = new Queue<OutboxJobPayload>(OUTBOX_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 10,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { count: 5_000 },
    removeOnFail:    { count: 10_000 },
  },
})

export const resumeQueue = new Queue<ResumeJobPayload>(RESUME_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 5_000 },
    removeOnFail:    { count: 10_000 },
  },
})
