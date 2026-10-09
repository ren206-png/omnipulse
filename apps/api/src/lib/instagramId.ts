/**
 * The Instagram Graph API needs the numeric Instagram Business Account ID, but the OAuth callback
 * stores the account's display name (the handle) in SocialAccount.externalProfileId. Resolve the
 * numeric ID from the stored token: match the handle against the Pages the token can see.
 */
const cache = new Map<string, string>()

export async function resolveInstagramUserId(accessToken: string, stored: string | null): Promise<string | null> {
  const handle = (stored ?? '').trim().replace(/^@/, '')
  if (/^\d+$/.test(handle)) return handle

  const cacheKey = handle.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const res = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=${encodeURIComponent('instagram_business_account{id,username}')}&limit=100&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  if (!res.ok) return null
  const body = (await res.json().catch(() => ({}))) as {
    data?: Array<{ instagram_business_account?: { id?: string; username?: string } }>
  }
  const accounts = (body.data ?? []).map((p) => p.instagram_business_account).filter((a): a is { id?: string; username?: string } => !!a?.id)
  const match = accounts.find((a) => a.username?.toLowerCase() === cacheKey) ?? (accounts.length === 1 ? accounts[0] : undefined)
  if (!match?.id) return null
  cache.set(cacheKey, match.id)
  return match.id
}

export const INSTAGRAM_RECONNECT_MESSAGE =
  'Invalid Instagram account — could not find its Business Account ID. Disconnect and reconnect Instagram on the Accounts page (it must be linked to a Facebook Page).'
