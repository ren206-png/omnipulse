/**
 * Automation Engine — Distributed Lock (Redis)
 *
 * Simple mutex using SET NX PX + Lua-script release.
 * Each lock acquisition returns a random token; only the holder can release.
 *
 * Usage:
 *   const lock = new DistributedLock(redis)
 *   const token = await lock.acquire(instanceLockKey(id), 30_000)
 *   if (!token) throw new RetryableError('lock busy')
 *   try { ... } finally { await lock.release(instanceLockKey(id), token) }
 */

import { Redis } from 'ioredis'
import { randomBytes } from 'node:crypto'

/** Lua: delete key only if its value equals the caller's token */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`

export class DistributedLock {
  constructor(private readonly redis: Redis) {}

  /**
   * Try to acquire the lock.
   * @returns the lock token on success, null if already held.
   */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomBytes(16).toString('hex')
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX')
    return result === 'OK' ? token : null
  }

  /**
   * Release the lock. Safe to call even if the lock has expired.
   */
  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, key, token)
  }
}

export function instanceLockKey(instanceId: string): string {
  return `automation-lock-instance-${instanceId}`
}
