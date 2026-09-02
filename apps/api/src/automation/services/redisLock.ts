/**
 * Singleton ioredis client for distributed locks.
 * Separate from BullMQ's connection — BullMQ uses its own ioredis instances
 * internally; sharing is safe but we keep a dedicated one for clarity.
 */

import IORedis from 'ioredis'
import { redisConnection } from '../../lib/queue.js'
import { DistributedLock } from './distributedLock.js'

let _redis: IORedis | null = null

function getLockRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis({
      ...redisConnection,
      lazyConnect:      true,
      enableReadyCheck: false,
    })
  }
  return _redis
}

/** Shared DistributedLock instance — safe to use concurrently. */
export const distributedLock = new DistributedLock(getLockRedis())
