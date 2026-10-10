import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { sendError } from '../lib/apiError.js'
import { prisma } from '../lib/prisma.js'

export interface JwtPayload {
  id: string
  email: string
  role: string
  iat?: number
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.cookies as Record<string, string> | undefined)?.token
    ?? (typeof req.query.token === 'string' ? req.query.token : undefined)

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header')
    return
  }
  let payload: JwtPayload
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
  } catch {
    sendError(res, 401, 'INVALID_TOKEN', 'Token is invalid or expired')
    return
  }

  // Check user still exists and token was not issued before a password reset.
  // The lookup is cached briefly: it used to cost a cross-region round trip on every request.
  // Returns undefined when the user row no longer exists (deleted account).
  getPasswordChangedAtSec(payload.id)
    .then((changedAtSec) => {
      if (changedAtSec === undefined) {
        sendError(res, 401, 'UNAUTHORIZED', 'User not found')
        return
      }
      if (changedAtSec !== null && payload.iat !== undefined && payload.iat < changedAtSec) {
        sendError(res, 401, 'TOKEN_REVOKED', 'Token invalidated by password reset')
        return
      }
      req.user = payload
      next()
    })
    .catch(() => {
      sendError(res, 401, 'INVALID_TOKEN', 'Token is invalid or expired')
    })
}

// ── passwordChangedAt cache ───────────────────────────────────────────────────
// Bounded staleness: a password reset invalidates the entry immediately (see
// invalidateAuthCache, called from the reset route), so the TTL only matters if the
// API runs as several instances. Returns undefined for deleted users (not cached).
const PWD_CACHE_TTL_MS = 30_000
const PWD_CACHE_MAX = 5_000
const pwdCache = new Map<string, { changedAtSec: number | null; expiresAt: number }>()

async function getPasswordChangedAtSec(userId: string): Promise<number | null | undefined> {
  const hit = pwdCache.get(userId)
  if (hit && hit.expiresAt > Date.now()) return hit.changedAtSec

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } })
  if (!user) return undefined  // deleted user — not cached so each request re-checks

  const changedAtSec = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : null

  if (pwdCache.size >= PWD_CACHE_MAX) {
    const oldest = pwdCache.keys().next().value
    if (oldest !== undefined) pwdCache.delete(oldest)
  }
  pwdCache.set(userId, { changedAtSec, expiresAt: Date.now() + PWD_CACHE_TTL_MS })
  return changedAtSec
}

/** Drop the cached passwordChangedAt for a user — call after changing their password. */
export function invalidateAuthCache(userId: string): void {
  pwdCache.delete(userId)
}
