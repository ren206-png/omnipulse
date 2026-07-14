/**
 * healthProbes.ts — live subsystem health checks used by the /health/deep
 * endpoint and the system monitor worker.
 *
 * Each probe returns a SubsystemStatus — always resolves, never throws.
 */
import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { prisma } from './prisma.js'
import { redisConnection } from './queue.js'
import { getAllBreakers } from './circuitBreaker.js'
import { logger } from './logger.js'
import { getWorkerHeartbeats } from './workerHeartbeat.js'

export type SubsystemStatus = {
  status: 'ok' | 'degraded' | 'down'
  latencyMs?: number
  detail?: string
}

export interface DeepHealthReport {
  status: 'ok' | 'degraded' | 'down'
  ts: string
  uptimeSeconds: number
  subsystems: {
    database: SubsystemStatus
    redis: SubsystemStatus
    queues: SubsystemStatus & { counts?: Record<string, { waiting: number; active: number; failed: number }> }
    workers: SubsystemStatus & { heartbeats?: Record<string, { lastSeen: string; staleSec: number }> }
    circuitBreakers: SubsystemStatus & { breakers?: ReturnType<ReturnType<typeof getAllBreakers>[0]['toJSON']>[] }
  }
}

// ── Database probe ────────────────────────────────────────────────────────────

export async function probeDatabase(): Promise<SubsystemStatus> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', latencyMs: Date.now() - t0 }
  } catch (err) {
    logger.error({ err }, '[HealthProbe] Database check failed')
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Redis probe ───────────────────────────────────────────────────────────────

export async function probeRedis(): Promise<SubsystemStatus> {
  const t0 = Date.now()
  const client = new IORedis({ ...redisConnection, lazyConnect: true, connectTimeout: 3000 })
  try {
    await client.connect()
    const pong = await client.ping()
    await client.quit()
    return pong === 'PONG'
      ? { status: 'ok', latencyMs: Date.now() - t0 }
      : { status: 'degraded', latencyMs: Date.now() - t0, detail: `Unexpected ping response: ${pong}` }
  } catch (err) {
    try { await client.quit() } catch { /* ignore */ }
    logger.error({ err }, '[HealthProbe] Redis check failed')
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── BullMQ queue probe ────────────────────────────────────────────────────────

const MONITORED_QUEUES = [
  'publish-post',
  'analytics-sync',
  'guardian',
  'stuck-job-sweeper',
  'engagement-alert',
  'evergreen-recycler',
]

const FAILED_JOB_ALERT_THRESHOLD = 20

export async function probeQueues(): Promise<DeepHealthReport['subsystems']['queues']> {
  const counts: Record<string, { waiting: number; active: number; failed: number }> = {}
  let anyDegraded = false
  let anyDown = false

  for (const name of MONITORED_QUEUES) {
    try {
      const q = new Queue(name, { connection: redisConnection })
      const [waiting, active, failed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getFailedCount(),
      ])
      await q.close()
      counts[name] = { waiting, active, failed }
      if (failed >= FAILED_JOB_ALERT_THRESHOLD) anyDegraded = true
    } catch (err) {
      logger.error({ err, queue: name }, '[HealthProbe] Queue count failed')
      counts[name] = { waiting: -1, active: -1, failed: -1 }
      anyDown = true
    }
  }

  const status = anyDown ? 'down' : anyDegraded ? 'degraded' : 'ok'
  const detail = anyDegraded
    ? `One or more queues have ≥${FAILED_JOB_ALERT_THRESHOLD} failed jobs`
    : undefined

  return { status, counts, detail }
}

// ── Worker heartbeat probe ────────────────────────────────────────────────────

/** Workers are considered stale if they haven't checked in within this window */
const HEARTBEAT_STALE_SEC = {
  'guardian':           10 * 60,   // guardian runs every 5 min
  'stuck-job-sweeper':  15 * 60,   // runs every 10 min
  'rss-feed':           10 * 60,   // runs every 5 min
  'evergreen-recycler':  2 * 60 * 60, // runs every hour
  'analytics':          25 * 60 * 60, // runs daily
  'weekly-digest':       7 * 24 * 60 * 60, // weekly
} as const

export async function probeWorkers(): Promise<DeepHealthReport['subsystems']['workers']> {
  const heartbeats = await getWorkerHeartbeats()
  const result: Record<string, { lastSeen: string; staleSec: number }> = {}
  let anyStale = false

  for (const [name, staleThresholdSec] of Object.entries(HEARTBEAT_STALE_SEC)) {
    const lastSeen = heartbeats[name]
    if (!lastSeen) {
      result[name] = { lastSeen: 'never', staleSec: Infinity }
      anyStale = true
      continue
    }
    const staleSec = Math.floor((Date.now() - lastSeen.getTime()) / 1000)
    result[name] = { lastSeen: lastSeen.toISOString(), staleSec }
    if (staleSec > staleThresholdSec) anyStale = true
  }

  return {
    status: anyStale ? 'degraded' : 'ok',
    heartbeats: result,
    detail: anyStale ? 'One or more workers have not checked in recently' : undefined,
  }
}

// ── Circuit breaker probe ─────────────────────────────────────────────────────

export function probeCircuitBreakers(): DeepHealthReport['subsystems']['circuitBreakers'] {
  const breakers = getAllBreakers().map((b) => b.toJSON())
  const anyOpen = breakers.some((b) => b.state === 'OPEN')
  return {
    status: anyOpen ? 'degraded' : 'ok',
    breakers,
    detail: anyOpen ? 'One or more circuit breakers are OPEN' : undefined,
  }
}

// ── Aggregate deep health report ──────────────────────────────────────────────

export async function getDeepHealth(): Promise<DeepHealthReport> {
  const [database, redis, queues, workers] = await Promise.all([
    probeDatabase(),
    probeRedis(),
    probeQueues(),
    probeWorkers(),
  ])
  const circuitBreakers = probeCircuitBreakers()

  const subsystems = { database, redis, queues, workers, circuitBreakers }

  const statuses = Object.values(subsystems).map((s) => s.status)
  const overallStatus: DeepHealthReport['status'] =
    statuses.some((s) => s === 'down') ? 'down' :
    statuses.some((s) => s === 'degraded') ? 'degraded' : 'ok'

  return {
    status: overallStatus,
    ts: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    subsystems,
  }
}
