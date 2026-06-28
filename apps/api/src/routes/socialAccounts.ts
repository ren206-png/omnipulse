import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { checkLimit } from '../lib/planLimits.js'

const router = Router()
const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const

// OAuth endpoints — must be registered BEFORE the requireAuth middleware
// GET /api/v1/social-accounts/oauth/connect?platform=INSTAGRAM&workspaceId=xxx
router.get('/oauth/connect', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { platform, workspaceId } = req.query as Record<string, string>
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!platform || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    sendError(res, 400, 'INVALID_PLATFORM', `platform must be one of: ${VALID_PLATFORMS.join(', ')}`)
    return
  }

  // Generate a cryptographically secure PKCE verifier (43-128 chars, URL-safe)
  const pkceVerifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
  const statePayload = { platform, workspaceId, userId: req.user!.id, pkceVerifier }
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1/social-accounts/oauth/callback`

  const urls: Record<string, string> = {
    INSTAGRAM: `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID ?? 'INSTAGRAM_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code&state=${state}`,
    FACEBOOK: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.FACEBOOK_CLIENT_ID ?? 'FACEBOOK_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement&response_type=code&state=${state}`,
    X: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.X_CLIENT_ID ?? 'X_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=tweet.read+tweet.write+users.read&state=${state}&code_challenge=${pkceVerifier}&code_challenge_method=plain`,
    TIKTOK: `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY ?? 'TIKTOK_CLIENT_KEY'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user.info.basic,video.upload&response_type=code&state=${state}`,
    GOOGLE: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID ?? 'GOOGLE_CLIENT_ID'}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&state=${state}`,
  }

  const url = urls[platform]
  res.redirect(url)
})

// GET /api/v1/social-accounts/oauth/callback?code=xxx&state=xxx
router.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'

  if (error) {
    res.redirect(`${webUrl}/dashboard/accounts?error=${encodeURIComponent(error)}`)
    return
  }

  try {
    const { platform, workspaceId, pkceVerifier } = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      platform: string
      workspaceId: string
      userId: string
      pkceVerifier?: string
    }
    const redirectUri = `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1/social-accounts/oauth/callback`

    let accessToken = ''
    let externalProfileId = ''
    let profileName = ''

    if (platform === 'INSTAGRAM') {
      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: process.env.INSTAGRAM_CLIENT_ID ?? '',
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET ?? '',
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string; user_id?: number }
      accessToken = tokenData.access_token ?? ''
      externalProfileId = String(tokenData.user_id ?? '')
      if (accessToken) {
        const profileRes = await fetch(`https://graph.instagram.com/me?fields=username&access_token=${accessToken}`)
        const profile = await profileRes.json() as { username?: string }
        profileName = profile.username ?? externalProfileId
      }
    } else if (platform === 'FACEBOOK') {
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
      )
      const tokenData = await tokenRes.json() as { access_token?: string }
      accessToken = tokenData.access_token ?? ''
      if (accessToken) {
        const profileRes = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}`)
        const profile = await profileRes.json() as { id?: string; name?: string }
        externalProfileId = profile.id ?? ''
        profileName = profile.name ?? externalProfileId
      }
    } else if (platform === 'X') {
      const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: pkceVerifier ?? 'challenge' }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string }
      accessToken = tokenData.access_token ?? ''
      if (accessToken) {
        const profileRes = await fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${accessToken}` } })
        const profile = await profileRes.json() as { data?: { id?: string; username?: string } }
        externalProfileId = profile.data?.id ?? ''
        profileName = profile.data?.username ?? externalProfileId
      }
    } else if (platform === 'TIKTOK') {
      const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string; open_id?: string }
      accessToken = tokenData.access_token ?? ''
      externalProfileId = tokenData.open_id ?? ''
      profileName = externalProfileId
    } else if (platform === 'GOOGLE') {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code,
        }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string }
      accessToken = tokenData.access_token ?? ''
      if (accessToken) {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
        const profile = await profileRes.json() as { id?: string; name?: string }
        externalProfileId = profile.id ?? ''
        profileName = profile.name ?? externalProfileId
      }
    }

    if (!accessToken) throw new Error('No access token received')

    const displayName = profileName || externalProfileId

    // SocialAccount has no unique constraint on workspaceId+platform, so use findFirst + create/update
    const existing = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: platform as typeof VALID_PLATFORMS[number] } })
    if (existing) {
      await prisma.socialAccount.update({
        where: { id: existing.id },
        data: { accessToken, externalProfileId: displayName },
      })
    } else {
      await prisma.socialAccount.create({
        data: { workspaceId, platform: platform as typeof VALID_PLATFORMS[number], accessToken, externalProfileId: displayName },
      })
    }

    logger.info({ platform, workspaceId }, 'OAuth account connected')
    res.redirect(`${webUrl}/dashboard/accounts?connected=${platform}`)
  } catch (err) {
    logger.error({ err }, 'OAuth callback error')
    res.redirect(`${(process.env.WEB_URL ?? 'http://localhost:3000')}/dashboard/accounts?error=oauth_failed`)
  }
})

router.use(requireAuth)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required')
    return
  }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, externalProfileId: true },
      orderBy: { platform: 'asc' },
    })
    res.json({ accounts })
  } catch (err) {
    logger.error({ err }, 'List social accounts error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list social accounts')
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, platform, externalProfileId, accessToken } = req.body as {
    workspaceId?: string
    platform?: string
    externalProfileId?: string
    accessToken?: string
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!platform || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    sendError(res, 400, 'INVALID_PLATFORM', `platform must be one of: ${VALID_PLATFORMS.join(', ')}`)
    return
  }
  if (!externalProfileId || !externalProfileId.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'externalProfileId is required')
    return
  }
  if (!accessToken || !accessToken.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'accessToken is required')
    return
  }

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const { allowed, limit, current } = await checkLimit(prisma, workspaceId, 'socialAccounts')
    if (!allowed) {
      sendError(res, 403, 'PLAN_LIMIT', `Plan limit reached: ${current}/${limit} social accounts. Upgrade to add more.`)
      return
    }

    const existing = await prisma.socialAccount.findFirst({
      where: { workspaceId, platform: platform as typeof VALID_PLATFORMS[number], externalProfileId: externalProfileId.trim() },
    })
    if (existing) {
      sendError(res, 409, 'ALREADY_CONNECTED', 'This account is already connected to the workspace')
      return
    }

    const account = await prisma.socialAccount.create({
      data: {
        workspaceId,
        platform: platform as typeof VALID_PLATFORMS[number],
        externalProfileId: externalProfileId.trim(),
        accessToken: accessToken.trim(),
      },
      select: { id: true, platform: true, externalProfileId: true },
    })

    logger.info({ accountId: account.id }, 'Social account connected')
    res.status(201).json({ account })
  } catch (err) {
    logger.error({ err }, 'Connect social account error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to connect social account')
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const account = await prisma.socialAccount.findUnique({ where: { id }, include: { workspace: true } })
    if (!account || account.workspace.ownerId !== req.user!.id) {
      sendError(res, 404, 'NOT_FOUND', 'Social account not found')
      return
    }
    await prisma.socialAccount.delete({ where: { id } })
    logger.info({ accountId: id }, 'Social account disconnected')
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete social account error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to disconnect social account')
  }
})

export default router
