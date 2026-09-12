import 'dotenv/config'
import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { AyrshareService } from '../integrations/ayrshare.js'
import { analyticsSyncQueue, redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { heartbeat } from '../lib/workerHeartbeat.js'

// Register the daily cron scheduler inside an async function so it executes
// AFTER the crash handlers in index.ts are registered (not at module load time).
// A top-level await here would throw before process.on('unhandledRejection') is wired.
async function registerScheduler(): Promise<void> {
  try {
    await analyticsSyncQueue.upsertJobScheduler('analytics-daily-sync', {
      pattern: '0 0 * * *',
    })
    logger.info('BullMQ job scheduler registered: analytics-daily-sync')
  } catch (err) {
    logger.error({ err }, 'Failed to register analytics-daily-sync scheduler')
  }
}
// Small delay so index.ts has time to wire crash handlers before this runs
setTimeout(() => { registerScheduler().catch(() => {}) }, 2000)

const worker = new Worker(
  'analytics-sync',
  async () => {
    // WEEKLY-AUDIT: no pagination here — fetches every row in one query; will timeout as table grows. Add take/cursor batching.
    const accounts = await prisma.socialAccount.findMany()
    let successCount = 0
    let failureCount = 0

    const service = new AyrshareService()

    for (const account of accounts) {
      try {
        const analytics = await service.getAnalytics(account.externalProfileId)
        // WEEKLY-AUDIT: use upsert keyed on (socialAccountId, date) to prevent duplicate rows if the scheduler fires twice (e.g. Redis failover).
        await prisma.analyticsSnapshot.create({
          data: {
            socialAccountId: account.id,
            followers: analytics.followers,
            impressions: analytics.impressions,
            engagementRate: analytics.engagementRate,
          },
        })
        successCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(
          { accountId: account.id, platform: account.platform, error: message },
          'Analytics sync failed for account',
        )
        failureCount++
      }
    }

    logger.info(
      { successCount, failureCount, total: accounts.length },
      'Analytics daily sync complete',
    )
    await heartbeat('analytics')
  },
  { connection: redisConnection },
)

worker.on('ready', () => {
  logger.info('BullMQ worker registered: analytics-sync')
})

export { worker as analyticsWorker }
