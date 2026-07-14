/**
 * System Monitor Worker — runs every 2 minutes, checks all subsystems,
 * auto-heals where possible, and fires alerts on degradation.
 *
 * Auto-heals:
 *  - Clears BullMQ failed jobs that are stuck with no more retries
 *  - Re-queues zombie posts (delegates to guardian.detectAndFix)
 *  - Resets open circuit breakers after recovery confirmation
 *
 * Alerts on (via alertManager, de-duped to 15 min):
 *  - Database down / slow (>2s)
 *  - Redis down
 *  - Queue failed-job count above threshold
 *  - Worker heartbeat stale
 *  - Any circuit breaker OPEN
 */
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { sendAlert } from '../lib/alertManager.js'
import { getDeepHealth } from '../lib/healthProbes.js'
import { detectAndFix } from '../lib/guardian.js'
import { getAllBreakers } from '../lib/circuitBreaker.js'
import { heartbeat } from '../lib/workerHeartbeat.js'

const MONITOR_INTERVAL_MS = 2 * 60 * 1000       // every 2 minutes
const DB_LATENCY_WARN_MS  = 1_000               // warn if DB >1s
const DB_LATENCY_CRIT_MS  = 2_000               // critical if DB >2s
const QUEUE_FAILED_WARN   = 10                  // warn at 10 failed
const QUEUE_FAILED_CRIT   = 50                  // critical at 50 failed

export const systemMonitorQueue = new Queue('system-monitor', { connection: redisConnection })

let _worker: Worker | null = null

async function runMonitorCycle(): Promise<void> {
  const report = await getDeepHealth()

  // ── Database ───────────────────────────────────────────────────────────────
  const db = report.subsystems.database
  if (db.status === 'down') {
    await sendAlert({
      key: 'db.down',
      severity: 'critical',
      title: 'Database is DOWN',
      message: db.detail ?? 'Prisma $queryRaw SELECT 1 failed',
      meta: { latencyMs: db.latencyMs },
    })
  } else if ((db.latencyMs ?? 0) >= DB_LATENCY_CRIT_MS) {
    await sendAlert({
      key: 'db.slow.critical',
      severity: 'critical',
      title: 'Database critically slow',
      message: `DB probe took ${db.latencyMs}ms (threshold: ${DB_LATENCY_CRIT_MS}ms)`,
      meta: { latencyMs: db.latencyMs },
    })
  } else if ((db.latencyMs ?? 0) >= DB_LATENCY_WARN_MS) {
    await sendAlert({
      key: 'db.slow.warning',
      severity: 'warning',
      title: 'Database responding slowly',
      message: `DB probe took ${db.latencyMs}ms (threshold: ${DB_LATENCY_WARN_MS}ms)`,
      meta: { latencyMs: db.latencyMs },
    })
  }

  // ── Redis ──────────────────────────────────────────────────────────────────
  const redis = report.subsystems.redis
  if (redis.status === 'down') {
    await sendAlert({
      key: 'redis.down',
      severity: 'critical',
      title: 'Redis is DOWN',
      message: redis.detail ?? 'Redis PING failed — BullMQ workers will not function',
      meta: { latencyMs: redis.latencyMs },
    })
  }

  // ── Queue health ───────────────────────────────────────────────────────────
  const queues = report.subsystems.queues
  const counts = queues.counts ?? {}
  for (const [qName, qCount] of Object.entries(counts)) {
    if (qCount.failed < 0) {
      // -1 means the probe itself failed
      await sendAlert({
        key: `queue.probe.${qName}`,
        severity: 'warning',
        title: `Queue probe failed: ${qName}`,
        message: 'Could not read BullMQ queue counts',
      })
      continue
    }
    if (qCount.failed >= QUEUE_FAILED_CRIT) {
      await sendAlert({
        key: `queue.failed.critical.${qName}`,
        severity: 'critical',
        title: `Critical failed jobs in '${qName}'`,
        message: `${qCount.failed} failed jobs in queue '${qName}'`,
        meta: qCount,
      })
      // Auto-heal: clean up failed jobs older than 1 hour to prevent backlog bloat
      try {
        const q = new Queue(qName, { connection: redisConnection })
        const cleaned = await q.clean(60 * 60 * 1000, 100, 'failed')
        await q.close()
        if (cleaned.length > 0) {
          logger.warn({ queue: qName, cleaned: cleaned.length }, '[SystemMonitor] Auto-cleaned failed jobs')
        }
      } catch (err) {
        logger.error({ err, queue: qName }, '[SystemMonitor] Failed to clean failed jobs')
      }
    } else if (qCount.failed >= QUEUE_FAILED_WARN) {
      await sendAlert({
        key: `queue.failed.warning.${qName}`,
        severity: 'warning',
        title: `Elevated failed jobs in '${qName}'`,
        message: `${qCount.failed} failed jobs in queue '${qName}'`,
        meta: qCount,
      })
    }
  }

  // ── Worker heartbeats ──────────────────────────────────────────────────────
  const workers = report.subsystems.workers
  if (workers.status === 'degraded') {
    const stale = Object.entries(workers.heartbeats ?? {})
      .filter(([, h]) => h.staleSec > 3600) // only alert if stale >1h
      .map(([name, h]) => `${name} (last seen: ${h.lastSeen})`)

    if (stale.length > 0) {
      await sendAlert({
        key: 'workers.stale',
        severity: 'warning',
        title: 'Workers have not checked in',
        message: stale.join(', '),
        meta: workers.heartbeats,
      })
    }
  }

  // ── Circuit breakers ───────────────────────────────────────────────────────
  const openBreakers = (report.subsystems.circuitBreakers.breakers ?? [])
    .filter((b) => b.state === 'OPEN')
  if (openBreakers.length > 0) {
    await sendAlert({
      key: 'circuit.open',
      severity: 'warning',
      title: 'Circuit breakers OPEN',
      message: openBreakers.map((b) => `${b.name} (${b.failures} failures, retry at ${b.nextAttemptAt})`).join('; '),
      meta: { breakers: openBreakers },
    })
  }

  // ── Zombie post auto-heal ─────────────────────────────────────────────────
  // Guardian runs every 5 min — system monitor supplements it by also running
  // detectAndFix on every monitor cycle (2 min) for tighter recovery.
  try {
    const guardianReport = await detectAndFix()
    if (guardianReport.zombiesFixed > 0) {
      logger.info(
        { zombiesFixed: guardianReport.zombiesFixed, postIds: guardianReport.fixedPostIds },
        '[SystemMonitor] Auto-fixed zombie posts',
      )
    }
  } catch (err) {
    logger.error({ err }, '[SystemMonitor] detectAndFix threw unexpectedly')
  }

  // Log summary
  const overallOk = report.status === 'ok'
  const logFn = overallOk ? logger.info.bind(logger) : logger.warn.bind(logger)
  logFn(
    {
      status: report.status,
      db: db.status,
      redis: redis.status,
      queues: queues.status,
      workers: workers.status,
      uptimeSeconds: report.uptimeSeconds,
    },
    '[SystemMonitor] Cycle complete',
  )

  await heartbeat('system-monitor')
}

export async function startSystemMonitorWorker(): Promise<void> {
  if (_worker) return

  await systemMonitorQueue.upsertJobScheduler(
    'system-monitor-cycle',
    { every: MONITOR_INTERVAL_MS },
    { data: {} },
  )

  _worker = new Worker(
    'system-monitor',
    async (_job) => {
      try {
        await runMonitorCycle()
      } catch (err) {
        logger.error({ err }, '[SystemMonitor] Unhandled error in monitor cycle')
        await sendAlert({
          key: 'monitor.crash',
          severity: 'critical',
          title: 'System monitor crashed',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  _worker.on('ready', () => logger.info('[SystemMonitor] Worker ready — monitoring every 2 minutes'))
  _worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, '[SystemMonitor] Job failed'))

  // Run immediately on startup so we don't wait 2 minutes for first check
  setTimeout(() => {
    runMonitorCycle().catch((err) =>
      logger.error({ err }, '[SystemMonitor] Initial cycle failed'),
    )
  }, 10_000) // 10s delay to let the server finish booting
}
