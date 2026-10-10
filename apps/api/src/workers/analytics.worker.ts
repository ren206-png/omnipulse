import 'dotenv/config'
import { Worker } from 'bullmq'
import { analyticsSyncQueue, redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { syncAnalytics } from './analyticsSync.worker.js'

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

// The daily job runs the direct platform-API sync (the same one the 6-hourly timer in index.ts
// runs). It used to go through Ayrshare, which needs AYRSHARE_API_KEY — unset in production — so
// every nightly run threw before it could record a heartbeat. syncAnalytics() records it itself.
const worker = new Worker(
  'analytics-sync',
  async () => {
    await syncAnalytics()
    logger.info('Analytics daily sync complete')
  },
  { connection: redisConnection },
)

worker.on('ready', () => {
  logger.info('BullMQ worker registered: analytics-sync')
})

export { worker as analyticsWorker }
