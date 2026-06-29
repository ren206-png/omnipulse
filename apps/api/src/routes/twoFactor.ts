import { Router } from 'express'
import type { Request, Response } from 'express'
import { TOTP, Secret } from 'otpauth'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { randomBytes } from 'crypto'

const router = Router()
router.use(requireAuth)

const APP_NAME = 'OmniPulse'

/** Verify a TOTP code against a base32 secret string */
function verifyTOTP(secret: string, token: string): boolean {
  const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
  return totp.validate({ token, window: 1 }) !== null
}

/** Generate a new TOTP instance and return secret + otpauth URI */
function createTOTP(email: string): { secret: string; uri: string } {
  const totp = new TOTP({ issuer: APP_NAME, label: email, algorithm: 'SHA1', digits: 6, period: 30 })
  return { secret: totp.secret.base32, uri: totp.toString() }
}

/** Generate 10 single-use backup codes */
function generateBackupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(4).toString('hex').toUpperCase()
    return `${raw.slice(0, 4)}-${raw.slice(4)}`
  })
}

// GET /api/v1/2fa/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorEnabled: true },
    })
    res.json({ enabled: user?.twoFactorEnabled ?? false })
  } catch (err) {
    logger.error({ err }, '2FA status error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get 2FA status')
  }
})

// POST /api/v1/2fa/setup — generate a new TOTP secret and return QR code
router.post('/setup', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, twoFactorEnabled: true },
    })
    if (!user) { sendError(res, 404, 'NOT_FOUND', 'User not found'); return }
    if (user.twoFactorEnabled) {
      sendError(res, 400, 'ALREADY_ENABLED', '2FA is already enabled. Disable it first.')
      return
    }

    const { secret, uri } = createTOTP(user.email)
    const qrCode = await QRCode.toDataURL(uri)

    // Persist the (unconfirmed) secret
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    })

    res.json({ secret, qrCode })
  } catch (err) {
    logger.error({ err }, '2FA setup error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set up 2FA')
  }
})

// POST /api/v1/2fa/verify-setup — confirm the TOTP code to activate 2FA
router.post('/verify-setup', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as { code?: string }
  if (!code) { sendError(res, 400, 'MISSING_FIELDS', 'code is required'); return }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    })
    if (!user?.twoFactorSecret) {
      sendError(res, 400, 'SETUP_REQUIRED', 'Call /2fa/setup first to generate a secret')
      return
    }
    if (user.twoFactorEnabled) {
      sendError(res, 400, 'ALREADY_ENABLED', '2FA is already enabled')
      return
    }

    if (!verifyTOTP(user.twoFactorSecret, code)) {
      sendError(res, 400, 'INVALID_CODE', 'Invalid or expired code')
      return
    }

    const backupCodes = generateBackupCodes()
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorEnabled: true, twoFactorBackupCodes: backupCodes },
    })

    logger.info({ userId: req.user!.id }, '2FA enabled')
    res.json({ enabled: true, backupCodes })
  } catch (err) {
    logger.error({ err }, '2FA verify-setup error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to verify 2FA setup')
  }
})

// POST /api/v1/2fa/disable — disable 2FA (requires current TOTP or backup code)
router.post('/disable', async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as { code?: string }
  if (!code) { sendError(res, 400, 'MISSING_FIELDS', 'code is required'); return }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
    })
    if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
      sendError(res, 400, 'NOT_ENABLED', '2FA is not enabled')
      return
    }

    const validTotp = verifyTOTP(user.twoFactorSecret, code)
    const backupIdx = user.twoFactorBackupCodes.indexOf(code.toUpperCase())
    if (!validTotp && backupIdx === -1) {
      sendError(res, 400, 'INVALID_CODE', 'Invalid code')
      return
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    })

    logger.info({ userId: req.user!.id }, '2FA disabled')
    res.json({ enabled: false })
  } catch (err) {
    logger.error({ err }, '2FA disable error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to disable 2FA')
  }
})

export { router as twoFactorRouter }
