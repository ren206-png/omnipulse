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
import { requireAuth, invalidateAuthCache } from '../middleware/auth.js'
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/email.js'
import { newVerifyToken, isVerifyTokenUsable } from '../lib/emailVerification.js'
import { TOTP, Secret } from 'otpauth'

function verifyTOTP(secret: string, token: string): boolean {
  const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
  return totp.validate({ token, window: 1 }) !== null
}

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

// Verification link clicks and re-sends get their own buckets
const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many verification attempts — please wait before trying again',
})
const resendVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many verification emails requested — please wait before trying again',
})

// Separate bucket for completing a reset so requesting links can't lock out setting the password
const resetCompleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many attempts — please wait before trying again',
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
    const verify = newVerifyToken()
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'OWNER',
        twoFactorBackupCodes: [],
        emailVerifyToken: verify.token,
        emailVerifyExpires: verify.expires,
      },
      select: { id: true, email: true, role: true },
    })
    // Create default workspace separately to avoid nested-create Prisma validation issues
    await prisma.$executeRaw`INSERT INTO "Workspace" (id, name, "ownerId") VALUES (gen_random_uuid()::text, 'My Workspace', ${user.id})`

    // No session yet: the account must confirm its email before it can sign in.
    await sendVerificationEmail({ to: user.email, verifyToken: verify.token })

    logger.info({ userId: user.id }, 'User registered — verification email sent')
    res.status(201).json({ requiresVerification: true, user })
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

    if (!user.emailVerifiedAt) {
      sendError(res, 403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email address first — check your inbox for the confirmation link.')
      return
    }

    // If 2FA is enabled, return a short-lived intermediate token instead
    if (user.twoFactorEnabled) {
      const twoFactorToken = jwt.sign(
        { id: user.id, twoFactor: true },
        env.JWT_SECRET,
        { expiresIn: '5m' },
      )
      res.json({ requiresTwoFactor: true, twoFactorToken })
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

// POST /api/v1/auth/2fa/verify-login — complete login when 2FA is enabled
router.post('/2fa/verify-login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { twoFactorToken, code } = req.body as { twoFactorToken?: string; code?: string }
  if (!twoFactorToken || !code) {
    sendError(res, 400, 'MISSING_FIELDS', 'twoFactorToken and code are required')
    return
  }
  try {
    let payload: { id: string; twoFactor?: boolean }
    try {
      payload = jwt.verify(twoFactorToken, env.JWT_SECRET) as { id: string; twoFactor?: boolean }
    } catch {
      sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired two-factor token')
      return
    }
    if (!payload.twoFactor) {
      sendError(res, 400, 'INVALID_TOKEN', 'Token is not a two-factor token')
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, twoFactorSecret: true, twoFactorBackupCodes: true, twoFactorEnabled: true },
    })
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      sendError(res, 400, 'NOT_ENABLED', '2FA is not enabled for this account')
      return
    }

    // Accept TOTP code or a backup code
    const validTotp = verifyTOTP(user.twoFactorSecret, code)
    const backupIdx = user.twoFactorBackupCodes.indexOf(code.toUpperCase())
    if (!validTotp && backupIdx === -1) {
      sendError(res, 401, 'INVALID_CODE', 'Invalid or expired code')
      return
    }

    // Consume backup code if used
    if (backupIdx !== -1) {
      const updated = [...user.twoFactorBackupCodes]
      updated.splice(backupIdx, 1)
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: updated } })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    )

    logger.info({ userId: user.id }, 'User logged in via 2FA')
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } })
  } catch (err) {
    logger.error({ err }, '2FA verify-login error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Login failed')
  }
})

// POST /api/v1/auth/verify-email — confirm an address using the emailed single-use token
router.post('/verify-email', verifyLimiter, async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body as { token?: string }
  if (!token || typeof token !== 'string') { sendError(res, 400, 'MISSING_FIELD', 'Verification token is required'); return }

  try {
    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } })
    if (!user || !isVerifyTokenUsable(user)) {
      sendError(res, 400, 'INVALID_TOKEN', 'This confirmation link is invalid or has expired. Request a new one.')
      return
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerifyToken: null, emailVerifyExpires: null },
    })
    logger.info({ userId: user.id }, 'Email verified')
    res.json({ message: 'Email confirmed. You can now sign in.' })
  } catch (err) {
    logger.error({ err }, 'Verify email error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to confirm email')
  }
})

// POST /api/v1/auth/resend-verification — always 200 so it cannot be used to probe for accounts
router.post('/resend-verification', resendVerifyLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string }
  if (!email || !email.includes('@')) { sendError(res, 400, 'INVALID_EMAIL', 'A valid email address is required'); return }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user && !user.emailVerifiedAt) {
      const verify = newVerifyToken()
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: verify.token, emailVerifyExpires: verify.expires },
      })
      await sendVerificationEmail({ to: user.email, verifyToken: verify.token })
    }
    res.json({ message: 'If that account needs confirming, a new link has been sent.' })
  } catch (err) {
    logger.error({ err }, 'Resend verification error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to process request')
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

router.post('/reset-password', resetCompleteLimiter, async (req: Request, res: Response): Promise<void> => {
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
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
        // Receiving the reset email proves ownership of the address
        ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date(), emailVerifyToken: null, emailVerifyExpires: null }),
      },
    })

    invalidateAuthCache(user.id)
    logger.info({ userId: user.id }, 'Password reset successfully')
    res.json({ message: 'Password updated successfully.' })
  } catch (err) {
    logger.error({ err }, 'Reset password error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reset password')
  }
})

// GET /api/v1/auth/me — return the authenticated user's profile from the JWT
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, role: true, createdAt: true },
    })
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'User not found')
      return
    }
    res.json({ user })
  } catch (err) {
    logger.error({ err }, '/me error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch user')
  }
})

export default router
