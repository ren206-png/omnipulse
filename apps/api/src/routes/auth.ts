import { Router } from 'express'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendPasswordResetEmail } from '../lib/email.js'

const router = Router()

// 10 attempts per 15 minutes per IP on sensitive auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts — please wait 15 minutes before trying again',
})

// 5 reset requests per hour per IP
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many reset requests — please wait before trying again',
})

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    sendError(res, 400, 'INVALID_EMAIL', 'A valid email address is required')
    return
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    sendError(res, 400, 'INVALID_PASSWORD', 'Password must be at least 8 characters')
    return
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      sendError(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists')
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'OWNER',
        workspaces: { create: { name: 'My Workspace' } },
      },
      select: { id: true, email: true, role: true },
    })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      // expiresIn requires StringValue (branded ms type); cast plain string to satisfy constraint
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    )

    logger.info({ userId: user.id }, 'User registered')
    res.status(201).json({ token, user })
  } catch (err) {
    logger.error({ err }, 'Register error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Registration failed')
  }
})

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || typeof email !== 'string') {
    sendError(res, 400, 'INVALID_EMAIL', 'Email is required')
    return
  }
  if (!password || typeof password !== 'string') {
    sendError(res, 400, 'INVALID_PASSWORD', 'Password is required')
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      return
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      return
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    )

    logger.info({ userId: user.id }, 'User logged in')
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } })
  } catch (err) {
    logger.error({ err }, 'Login error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Login failed')
  }
})

router.post('/forgot-password', resetLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string }
  if (!email || !email.includes('@')) {
    sendError(res, 400, 'INVALID_EMAIL', 'A valid email address is required')
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    // Always respond 200 to avoid leaking whether the email exists
    if (!user) {
      res.json({ message: 'If that email exists, a reset link has been sent.' })
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 1000 * 60 * 60) // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    })

    logger.info({ userId: user.id }, 'Password reset token generated')
    await sendPasswordResetEmail({ to: user.email, resetToken: token })
    if (env.NODE_ENV !== 'production') {
      console.log(`\n[DEV] Password reset link: ${process.env.WEB_URL ?? 'http://localhost:3000'}/reset-password/${token}\n`)
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch (err) {
    logger.error({ err }, 'Forgot password error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to process request')
  }
})

router.post('/reset-password', resetLimiter, async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string }
  if (!token) { sendError(res, 400, 'MISSING_FIELD', 'Reset token is required'); return }
  if (!password || password.length < 8) {
    sendError(res, 400, 'INVALID_PASSWORD', 'Password must be at least 8 characters')
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { passwordResetToken: token } })
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      sendError(res, 400, 'INVALID_TOKEN', 'Reset token is invalid or has expired')
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
    })

    logger.info({ userId: user.id }, 'Password reset successfully')
    res.json({ message: 'Password updated successfully.' })
  } catch (err) {
    logger.error({ err }, 'Reset password error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reset password')
  }
})

export default router
