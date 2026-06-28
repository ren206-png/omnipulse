import type { Request, Response, NextFunction } from 'express'
import { sendError } from '../lib/apiError.js'

interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

interface HitRecord {
  count: number
  resetAt: number
}

export function rateLimit({ windowMs, max, message }: RateLimitOptions) {
  const hits = new Map<string, HitRecord>()

  // Sweep expired entries every window to avoid unbounded growth
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of hits) {
      if (record.resetAt <= now) hits.delete(key)
    }
  }, windowMs).unref()

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
      ?? req.socket.remoteAddress
      ?? 'unknown'

    const now = Date.now()
    const record = hits.get(ip)

    if (!record || record.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs })
      next()
      return
    }

    record.count++

    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000)
      res.setHeader('Retry-After', retryAfter)
      sendError(res, 429, 'TOO_MANY_REQUESTS', message ?? 'Too many requests — please try again later')
      return
    }

    next()
  }
}
