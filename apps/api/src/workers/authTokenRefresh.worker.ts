/**
 * Auth Token Refresh Worker — runs every 30 minutes.
 *
 * Scans SocialAccounts whose OAuth tokens expire within 2 hours and
 * attempts to refresh them automatically. Platforms that support
 * programmatic refresh: Facebook/Instagram (long-lived token exchange),
 * LinkedIn (refresh token grant). Others (TikTok, X, Google) require
 * user re-authentication and are flagged with an admin alert instead.
 *
 * Auto-heals:
 *  - Refreshes expiring Facebook/Instagram tokens (60-day long-lived exchange)
 *  - Refreshes LinkedIn tokens via refresh_token grant
 *
 * Alerts on:
 *  - Accounts that need user re-auth (TikTok, X, Google, or refresh failures)
 *  - Unexpected errors during the refresh cycle
 */
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'
import { sendAlert } from '../lib/alertManager.js'
import { heartbeat } from '../lib/workerHeartbeat.js'
import { decryptToken, encryptToken } from '../lib/tokenEncryption.js'

const REFRESH_INTERVAL_MS = 30 * 60 * 1000  // every 30 minutes
const REFRESH_WINDOW_MS   = 2 * 60 * 60 * 1000 // refresh if expiring within 2h

export const authTokenRefreshQueue = new Queue('auth-token-refresh', { connection: redisConnection })

let _worker: Worker | null = null

// ── Platform-specific refresh logic ──────────────────────────────────────────

async function refreshFacebookToken(accessToken: string): Promise<{ token: string; expiresAt: Date } | null> {
  const appId     = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  if (!appId || !appSecret) return null

  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return null

  const data = await res.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1000) // default 60 days
  return { token: data.access_token, expiresAt }
}

async function refreshLinkedInToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const clientId     = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null

  const data = await res.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000)
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
  }
}

// ── Main refresh cycle ────────────────────────────────────────────────────────

async function runTokenRefreshCycle(): Promise<void> {
  const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS)

  // Find accounts whose tokens expire within the window (or have no expiry set
  // but a refreshToken exists — assume they need a proactive refresh).
  const expiringAccounts = await prisma.socialAccount.findMany({
    where: {
      OR: [
        { tokenExpiresAt: { lte: cutoff } },
        { tokenExpiresAt: null, refreshToken: { not: null } },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      platform: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      externalProfileId: true,
    },
  })

  if (expiringAccounts.length === 0) {
    logger.debug('[TokenRefresh] No expiring tokens — cycle done')
    await heartbeat('auth-token-refresh')
    return
  }

  logger.info({ count: expiringAccounts.length }, '[TokenRefresh] Found expiring/expired tokens')

  const needsReauth: string[] = []
  let refreshed = 0
  let failed = 0

  for (const account of expiringAccounts) {
    try {
      if (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM') {
        const result = await refreshFacebookToken(decryptToken(account.accessToken))
        if (result) {
          await prisma.socialAccount.update({
            where: { id: account.id },
            data: { accessToken: encryptToken(result.token), tokenExpiresAt: result.expiresAt },
          })
          refreshed++
          logger.info(
            { accountId: account.id, platform: account.platform, expiresAt: result.expiresAt },
            '[TokenRefresh] Token refreshed',
          )
        } else {
          needsReauth.push(`${account.platform}:${account.externalProfileId} (workspace: ${account.workspaceId})`)
          failed++
        }
      } else if (account.platform === 'LINKEDIN' && account.refreshToken) {
        const result = await refreshLinkedInToken(decryptToken(account.refreshToken))
        if (result) {
          await prisma.socialAccount.update({
            where: { id: account.id },
            data: {
              accessToken:    encryptToken(result.accessToken),
              refreshToken:   encryptToken(result.refreshToken),
              tokenExpiresAt: result.expiresAt,
            },
          })
          refreshed++
          logger.info(
            { accountId: account.id, platform: 'LINKEDIN', expiresAt: result.expiresAt },
            '[TokenRefresh] LinkedIn token refreshed',
          )
        } else {
          needsReauth.push(`LINKEDIN:${account.externalProfileId} (workspace: ${account.workspaceId})`)
          failed++
        }
      } else {
        // TikTok, X, Google — no server-side refresh possible
        needsReauth.push(`${account.platform}:${account.externalProfileId} (workspace: ${account.workspaceId})`)
      }
    } catch (err) {
      logger.error({ err, accountId: account.id }, '[TokenRefresh] Unexpected error refreshing token')
      failed++
    }
  }

  if (needsReauth.length > 0) {
    await sendAlert({
      key: 'auth.tokens.reauth-required',
      severity: 'warning',
      title: 'Social accounts require re-authentication',
      message: `${needsReauth.length} account(s) have expiring tokens that cannot be auto-refreshed`,
      meta: { accounts: needsReauth },
    })
  }

  logger.info(
    { total: expiringAccounts.length, refreshed, failed, needsReauth: needsReauth.length },
    '[TokenRefresh] Cycle complete',
  )

  await heartbeat('auth-token-refresh')
}

// ── Worker bootstrap ──────────────────────────────────────────────────────────

export async function startAuthTokenRefreshWorker(): Promise<void> {
  if (_worker) return

  await authTokenRefreshQueue.upsertJobScheduler(
    'auth-token-refresh-cycle',
    { every: REFRESH_INTERVAL_MS },
    { data: {} },
  )

  _worker = new Worker(
    'auth-token-refresh',
    async (_job) => {
      try {
        await runTokenRefreshCycle()
      } catch (err) {
        logger.error({ err }, '[TokenRefresh] Unhandled error in refresh cycle')
        await sendAlert({
          key: 'auth.tokens.refresh-crash',
          severity: 'critical',
          title: 'Auth token refresh worker crashed',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    },
    { connection: redisConnection, concurrency: 1 },
  )

  _worker.on('ready', () => logger.info('[TokenRefresh] Worker ready — checking every 30 minutes'))
  _worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, '[TokenRefresh] Job failed'))

  // Run immediately on startup so stale tokens are caught without waiting
  setTimeout(() => {
    runTokenRefreshCycle().catch((err) =>
      logger.error({ err }, '[TokenRefresh] Initial cycle failed'),
    )
  }, 15_000) // 15s delay — after system monitor starts
}
