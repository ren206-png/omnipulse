import 'dotenv/config'
import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { AyrshareService } from '../integrations/ayrshare.js'
import { analyticsSyncQueue, redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'

try {
  await analyticsSyncQueue.upsertJobScheduler('analytics-daily-sync', {
    pattern: '0 0 * * *',
  })
  logger.info('BullMQ job scheduler registered: analytics-daily-sync')
} catch (err) {
  logger.error({ err }, 'Failed to register analytics-daily-sync scheduler')
}

const worker = new Worker(
  'analytics-sync',
  async () => {
    const accounts = await prisma.socialAccount.findMany()
    let successCount = 0
    let failureCount = 0

    const service = new AyrshareService()

    for (const account of accounts) {
      try {
        const analytics = await service.getAnalytics(account.externalProfileId)
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
  },
  { connection: redisConnection },
)

worker.on('ready', () => {
  logger.info('BullMQ worker registered: analytics-sync')
})

export { worker as analyticsWorker }
