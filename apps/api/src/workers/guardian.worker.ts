/**
 * Guardian Worker — runs every 5 minutes to detect and fix stalled/zombie posts.
 * Started from index.ts alongside the evergreen worker.
 */
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { detectAndFix, remindPendingReviews } from '../lib/guardian.js'

const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Dedicated queue for the guardian repeatable job
export const guardianQueue = new Queue('guardian', { connection: redisConnection })

let _guardianWorker: Worker | null = null

export async function startGuardianWorker(): Promise<void> {
  if (_guardianWorker) return // already running

  // Ensure the repeatable job exists (upsert-safe — BullMQ deduplicates by key)
  await guardianQueue.add(
    'guardian-scan',
    {},
    {
      repeat: { every: INTERVAL_MS },
      jobId: 'guardian-scan-repeatable',
    },
  )

  _guardianWorker = new Worker(
    'guardian',
    async (_job) => {
      logger.info('[Guardian] Running scan…')
      const report = await detectAndFix()

      // Also send approval reminders for stale PENDING_REVIEW posts
      await remindPendingReviews()

      if (report.zombiesFixed > 0) {
        logger.warn(
          { zombiesFixed: report.zombiesFixed, fixedPostIds: report.fixedPostIds },
          '[Guardian] Auto-fixed zombie posts',
        )
      } else {
        logger.info('[Guardian] No zombie posts found')
      }

      if (report.errors.length > 0) {
        logger.error({ errors: report.errors }, '[Guardian] Errors during scan')
      }

      return report
    },
    { connection: redisConnection },
  )

  _guardianWorker.on('ready', () => {
    logger.info('[Guardian] Worker registered — scanning every 5 minutes')
  })

  _guardianWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[Guardian] Scan job failed')
  })

  // Note: global crash handlers (uncaughtException / unhandledRejection) are
  // registered once in index.ts — avoid duplicate listeners across workers.
}
