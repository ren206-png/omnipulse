import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

// Called on a schedule or manually — syncs follower/engagement data from social APIs
export async function syncAnalytics(workspaceId?: string): Promise<void> {
  const where = workspaceId ? { workspaceId } : {}
  const accounts = await prisma.socialAccount.findMany({ where })

  for (const account of accounts) {
    try {
      let followers = 0
      let impressions = 0
      let engagementRate = 0

      if (account.platform === 'INSTAGRAM') {
        const res = await fetch(
          `https://graph.instagram.com/me?fields=followers_count,media_count&access_token=${account.accessToken}`,
        )
        if (res.ok) {
          const data = await res.json() as { followers_count?: number; media_count?: number }
          followers = data.followers_count ?? 0
          impressions = data.media_count ?? 0
          engagementRate = followers > 0 ? (impressions / followers) * 100 : 0
        }
      } else if (account.platform === 'FACEBOOK') {
        const res = await fetch(
          `https://graph.facebook.com/me?fields=fan_count&access_token=${account.accessToken}`,
        )
        if (res.ok) {
          const data = await res.json() as { fan_count?: number }
          followers = data.fan_count ?? 0
          engagementRate = 2.5 // placeholder
        }
      } else if (account.platform === 'X') {
        const res = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        })
        if (res.ok) {
          const data = await res.json() as { data?: { public_metrics?: { followers_count?: number; tweet_count?: number } } }
          followers = data.data?.public_metrics?.followers_count ?? 0
          impressions = data.data?.public_metrics?.tweet_count ?? 0
          engagementRate = followers > 0 ? 3.2 : 0
        }
      }

      await prisma.analyticsSnapshot.create({
        data: { socialAccountId: account.id, followers, impressions, engagementRate },
      })

      logger.info({ accountId: account.id, platform: account.platform, followers }, 'Analytics synced')
    } catch (err) {
      logger.error({ err, accountId: account.id }, 'Analytics sync failed for account')
    }
  }
}
