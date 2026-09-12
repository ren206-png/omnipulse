import 'dotenv/config'
import { Queue } from 'bullmq'

function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`REDIS_URL is not a valid URL: ${url}`)
  }
  const dbIndex = parsed.pathname.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : NaN
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: Number.isNaN(dbIndex) ? undefined : dbIndex,
  }
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
export const redisConnection = {
  ...parseRedisUrl(redisUrl),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
}

export const publishPostQueue = new Queue('publish-post', { connection: redisConnection })
publishPostQueue.on('error', (err) => console.error('[Queue:publish-post] Error:', err.message))

export const analyticsSyncQueue = new Queue('analytics-sync', { connection: redisConnection })
analyticsSyncQueue.on('error', (err) => console.error('[Queue:analytics-sync] Error:', err.message))
