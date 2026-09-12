/**
 * Stuck-Job Sweeper Worker — runs every 10 minutes.
 * Finds posts stuck in 'processing' status for >15 min, then either requeues
 * (attempts < 3) or moves to DLQ (attempts >= 3).
 */
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection, publishPostQueue } from '../lib/queue.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { notify, getWorkspaceAdmins } from '../lib/notify.js'
import { heartbeat } from '../lib/workerHeartbeat.js'

const STUCK_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVAL_MS = 10 * 60 * 1000  // every 10 minutes

export const stuckJobSweeperQueue = new Queue('stuck-job-sweeper', { connection: redisConnection })

let _worker: Worker | null = null

export async function startStuckJobSweeperWorker(): Promise<void> {
  if (_worker) return // already running

  await stuckJobSweeperQueue.upsertJobScheduler(
    'stuck-job-sweep',
    { every: CHECK_INTERVAL_MS },
    { data: {} },
  )

  _worker = new Worker(
    'stuck-job-sweeper',
    async (_job) => {
      logger.info('[StuckJobSweeper] Running sweep…')

      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

      // Find posts stuck in PROCESSING status.
      // Use updatedAt (the time the status was last changed) as the cutoff so
      // posts created long ago but only recently set to PROCESSING are swept
      // correctly — createdAt was previously used but gave inaccurate results.
      const stuckPosts = await (prisma as any).scheduledPost.findMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          workspaceId: true,
          platforms: true,
          updatedAt: true,
          errorLog: true,
        },
      })

      if (stuckPosts.length === 0) {
        logger.info('[StuckJobSweeper] No stuck posts found')
        await heartbeat('stuck-job-sweeper')
        return { swept: 0 }
      }

      logger.warn({ count: stuckPosts.length }, '[StuckJobSweeper] Found stuck posts')

      let requeued = 0
      let dlqd = 0

      // Parse attempt counts for each post
      const postsWithAttempts = stuckPosts.map((post) => {
        // WEEKLY-AUDIT: _attempts is stored in errorLog, but publishPost.worker.ts overwrites errorLog on failure (line ~445).
        // If a post gets stuck again after a failed publish attempt, _attempts resets to 0 — allowing unbounded requeues.
        // Fix: add a dedicated sweeperAttempts column on ScheduledPost and read/write that instead.
        let attempts = 0
        if (post.errorLog) {
          try {
            const parsed = JSON.parse(post.errorLog) as Record<string, unknown>
            attempts = typeof parsed._attempts === 'number' ? parsed._attempts : 0
          } catch { /* ignore parse errors */ }
        }
        return { ...post, attempts }
      })

      const toRequeue = postsWithAttempts.filter((p) => p.attempts < 3)
      const toDlq = postsWithAttempts.filter((p) => p.attempts >= 3)

      // --- Requeue batch ---
      if (toRequeue.length > 0) {
        const requeueAt = new Date().toISOString()
        await Promise.allSettled(
          toRequeue.map(async (post) => {
            try {
              await (prisma as any).scheduledPost.update({
                where: { id: post.id },
                data: {
                  status: 'SCHEDULED',
                  errorLog: JSON.stringify({ _attempts: post.attempts + 1, _requeuedAt: requeueAt }),
                },
              })
              await publishPostQueue.add(
                'publish-post',
                { postId: post.id, workspaceId: post.workspaceId },
                { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
              )
              requeued++
            } catch (err) {
              logger.error({ err, postId: post.id }, '[StuckJobSweeper] Failed to requeue post')
            }
          }),
        )
        logger.info({ requeued }, '[StuckJobSweeper] Requeued stuck posts')
      }

      // --- DLQ batch ---
      if (toDlq.length > 0) {
        // Create DLQ records individually (each has unique error message)
        await Promise.allSettled(
          toDlq.map((post) =>
            (prisma as any).postDlq.create({
              data: {
                postId: post.id,
                workspaceId: post.workspaceId,
                platform: (post.platforms as string[]).join(','),
                errorMessage: `Post stuck in PROCESSING for >${STUCK_THRESHOLD_MS / 60000}min after ${post.attempts} attempts`,
                attempts: post.attempts,
              },
            }),
          ),
        )

        // Batch-update all DLQ posts to FAILED in one query
        await (prisma as any).scheduledPost.updateMany({
          where: { id: { in: toDlq.map((p) => p.id) } },
          data: { status: 'FAILED' },
        })
        dlqd = toDlq.length
        logger.warn({ dlqd }, '[StuckJobSweeper] Moved stuck posts to DLQ')

        // Notify workspace admins (grouped by workspace)
        const workspaceIds = [...new Set(toDlq.map((p) => p.workspaceId))]
        await Promise.allSettled(
          workspaceIds.map(async (workspaceId) => {
            try {
              const adminIds = await getWorkspaceAdmins(workspaceId as string)
              const count = toDlq.filter((p) => p.workspaceId === workspaceId).length
              await Promise.allSettled(
                adminIds.map((userId: string) =>
                  notify({
                    userId,
                    type: 'POST_FAILED',
                    title: `${count} post(s) moved to DLQ`,
                    body: `${count} stuck post(s) were moved to the dead-letter queue after repeated failures.`,
                    link: '/dashboard/admin/dlq',
                  }),
                ),
              )
            } catch (err) {
              logger.error({ err, workspaceId }, '[StuckJobSweeper] Failed to send DLQ notifications')
            }
          }),
        )
      }

      logger.info({ requeued, dlqd }, '[StuckJobSweeper] Sweep complete')
      await heartbeat('stuck-job-sweeper')
      return { swept: stuckPosts.length, requeued, dlqd }
    },
    { connection: redisConnection },
  )

  _worker.on('ready', () => {
    logger.info('[StuckJobSweeper] Worker registered — sweeping every 10 minutes')
  })

  _worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[StuckJobSweeper] Sweep job failed')
  })
}
