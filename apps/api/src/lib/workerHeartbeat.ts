/**
 * Worker heartbeat system.
 *
 * Each worker calls `heartbeat(name)` at the end of every successful run.
 * The system monitor reads these to detect hung/dead workers.
 *
 * Uses a Redis hash so heartbeats survive process restarts as long as Redis is up.
 * Falls back to in-memory if Redis is unavailable.
 */
import IORedis from 'ioredis'
import { redisConnection } from './queue.js'
import { logger } from './logger.js'

const REDIS_KEY = 'omnipulse:worker:heartbeats'

// Lazy singleton Redis client for heartbeats only
let _redis: IORedis | null = null

function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis({ ...redisConnection, lazyConnect: false, enableReadyCheck: false })
    _redis.on('error', (err) => logger.warn({ err }, '[Heartbeat] Redis error'))
  }
  return _redis
}

// In-memory fallback when Redis is unavailable
const memoryFallback = new Map<string, Date>()

/**
 * Record a heartbeat for a named worker. Call this at the end of each worker tick.
 */
export async function heartbeat(workerName: string): Promise<void> {
  const ts = Date.now().toString()
  memoryFallback.set(workerName, new Date())
  try {
    await getRedis().hset(REDIS_KEY, workerName, ts)
  } catch {
    // Silently fall back to memory — we already updated the in-memory map
  }
}

/**
 * Retrieve the last heartbeat timestamps for all workers.
 * Returns a map of workerName → Date (or undefined if never seen).
 */
export async function getWorkerHeartbeats(): Promise<Record<string, Date | undefined>> {
  try {
    const raw = await getRedis().hgetall(REDIS_KEY)
    if (raw) {
      return Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, new Date(parseInt(v, 10))]),
      )
    }
  } catch {
    // Fall through to memory fallback
  }
  // Memory fallback
  return Object.fromEntries([...memoryFallback.entries()])
}
