import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { sendError } from '../lib/apiError.js'

export interface JwtPayload {
  id: string
  email: string
  role: string
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
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    req.user = payload
    next()
  } catch {
    sendError(res, 401, 'INVALID_TOKEN', 'Token is invalid or expired')
    return
  }
}
