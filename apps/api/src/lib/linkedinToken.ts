/**
 * LinkedIn token expiry detection and refresh logic.
 */
import { prisma } from './prisma.js'
import { encryptToken, decryptToken } from './tokenEncryption.js'
import { notify } from './notify.js'
import { logger } from './logger.js'

const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface LinkedInAccount {
  id: string
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  workspaceId: string
}

/** Returns true if token is expired or within 7 days of expiry */
export function isLinkedInTokenExpired(account: LinkedInAccount): boolean {
  if (!account.tokenExpiresAt) return false // no expiry stored — assume valid
  return account.tokenExpiresAt.getTime() - Date.now() < EXPIRY_WARNING_MS
}

/**
 * Attempt to refresh the LinkedIn access token using the stored refresh token.
 * Updates the SocialAccount record on success.
 * On failure, marks the account as needing re-auth by clearing tokenExpiresAt to epoch (past).
 * Returns the decrypted new access token on success, null on failure.
 */
export async function refreshLinkedInToken(
  account: LinkedInAccount,
  submitterId: string | null,
): Promise<string | null> {
  if (!account.refreshToken) {
    logger.warn({ accountId: account.id }, 'LinkedIn token expired — no refresh token available')
    await markExpired(account, submitterId, 'Your LinkedIn connection has expired. Please reconnect to continue publishing.')
    return null
  }

  const rawRefresh = decryptToken(account.refreshToken)
  const liClientId = process.env.LINKEDIN_CLIENT_ID ?? ''
  const liClientSecret = process.env.LINKEDIN_CLIENT_SECRET ?? ''

  try {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: rawRefresh,
        client_id: liClientId,
        client_secret: liClientSecret,
      }),
    })
    const data = await res.json() as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }
    if (!res.ok || !data.access_token) {
      logger.error({ data, accountId: account.id }, 'LinkedIn token refresh failed')
      await markExpired(account, submitterId, 'Your LinkedIn connection expired and could not be refreshed. Please reconnect.')
      return null
    }
    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(data.access_token),
        refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : account.refreshToken,
        tokenExpiresAt: newExpiresAt,
      },
    })
    logger.info({ accountId: account.id }, 'LinkedIn token refreshed successfully')
    return data.access_token
  } catch (err) {
    logger.error({ err, accountId: account.id }, 'LinkedIn token refresh error')
    await markExpired(account, submitterId, 'Your LinkedIn connection expired and could not be refreshed. Please reconnect.')
    return null
  }
}

async function markExpired(
  account: LinkedInAccount,
  submitterId: string | null,
  message: string,
): Promise<void> {
  // Set tokenExpiresAt to epoch so isLinkedInTokenExpired always returns true
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: { tokenExpiresAt: new Date(0) },
  })
  if (submitterId) {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000'
    await notify({
      userId: submitterId,
      type: 'POST_FAILED' as const,
      title: 'LinkedIn reconnection required',
      body: message,
      link: `${webUrl}/dashboard/accounts`,
    })
  }
}
