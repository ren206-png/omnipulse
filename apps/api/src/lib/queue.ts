import 'dotenv/config'
import { Queue } from 'bullmq'

function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : undefined,
  }
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
export const redisConnection = {
  ...parseRedisUrl(redisUrl),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
}

export const publishPostQueue = new Queue('publish-post', { connection: redisConnection })
export const analyticsSyncQueue = new Queue('analytics-sync', { connection: redisConnection })
