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

      // Find posts stuck in PROCESSING status
      // Note: PostStatus enum uses uppercase values
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
        return { swept: 0 }
      }

      logger.warn({ count: stuckPosts.length }, '[StuckJobSweeper] Found stuck posts')

      let requeued = 0
      let dlqd = 0

      for (const post of stuckPosts) {
        // Parse attempt count from errorLog or default to 0
        let attempts = 0
        if (post.errorLog) {
          try {
            const parsed = JSON.parse(post.errorLog) as Record<string, unknown>
            attempts = typeof parsed._attempts === 'number' ? parsed._attempts : 0
          } catch { /* ignore parse errors */ }
        }

        if (attempts < 3) {
          // Requeue
          try {
            await (prisma as any).scheduledPost.update({
              where: { id: post.id },
              data: {
                status: 'SCHEDULED',
                errorLog: JSON.stringify({ _attempts: attempts + 1, _requeuedAt: new Date().toISOString() }),
              },
            })
            await publishPostQueue.add(
              'publish-post',
              { postId: post.id, workspaceId: post.workspaceId },
              { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
            )
            logger.info({ postId: post.id, attempts }, '[StuckJobSweeper] Requeued stuck post')
            requeued++
          } catch (err) {
            logger.error({ err, postId: post.id }, '[StuckJobSweeper] Failed to requeue post')
          }
        } else {
          // Move to DLQ
          try {
            await (prisma as any).postDlq.create({
              data: {
                postId: post.id,
                workspaceId: post.workspaceId,
                platform: (post.platforms as string[]).join(','),
                errorMessage: `Post stuck in PROCESSING for >${STUCK_THRESHOLD_MS / 60000}min after ${attempts} attempts`,
                attempts,
              },
            })
            await (prisma as any).scheduledPost.update({
              where: { id: post.id },
              data: { status: 'FAILED' },
            })

            // Notify workspace admins
            const adminIds = await getWorkspaceAdmins(post.workspaceId)
            await Promise.allSettled(
              adminIds.map((userId: string) =>
                notify({
                  userId,
                  type: 'POST_FAILED',
                  title: 'Post stuck and moved to DLQ',
                  body: `Post ${post.id} was stuck in processing and has been moved to the dead-letter queue.`,
                  link: '/dashboard/calendar',
                }),
              ),
            )

            logger.warn({ postId: post.id, attempts }, '[StuckJobSweeper] Moved stuck post to DLQ')
            dlqd++
          } catch (err) {
            logger.error({ err, postId: post.id }, '[StuckJobSweeper] Failed to DLQ post')
          }
        }
      }

      logger.info({ requeued, dlqd }, '[StuckJobSweeper] Sweep complete')
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
