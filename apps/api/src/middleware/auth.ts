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

  // Check if the token was issued before a password reset
  prisma.user.findUnique({ where: { id: payload.id }, select: { passwordChangedAt: true } })
    .then((user) => {
      if (user?.passwordChangedAt && payload.iat !== undefined) {
        const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000)
        if (payload.iat < changedAtSec) {
          sendError(res, 401, 'TOKEN_REVOKED', 'Token invalidated by password reset')
          return
        }
      }
      req.user = payload
      next()
    })
    .catch(() => {
      sendError(res, 401, 'INVALID_TOKEN', 'Token is invalid or expired')
    })
}
