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
      let synced = false

      if (account.platform === 'INSTAGRAM') {
        // Instagram Business Account via Graph API v20
        // externalProfileId stores the IG Business Account ID (set during OAuth)
        const igUserId = account.externalProfileId
        const res = await fetch(
          `https://graph.facebook.com/v20.0/${igUserId}?fields=followers_count,media_count&access_token=${account.accessToken}`,
        )
        if (res.ok) {
          const data = await res.json() as { followers_count?: number; media_count?: number }
          followers = data.followers_count ?? 0
          impressions = data.media_count ?? 0
          // Rough engagement proxy: recent media count relative to followers
          // Real engagement requires insights API (needs Page/Business permissions)
          engagementRate = followers > 0 ? Math.min(10, (impressions / Math.max(followers, 1)) * 100) : 0
          synced = true
        } else {
          const err = await res.json().catch(() => ({}))
          logger.warn({ igUserId, err }, 'Instagram Graph API sync failed')
        }

      } else if (account.platform === 'FACEBOOK') {
        // Get page fan count + talking_about_count for engagement proxy
        const res = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=fan_count,talking_about_count&access_token=${account.accessToken}`,
        )
        if (res.ok) {
          const data = await res.json() as { fan_count?: number; talking_about_count?: number }
          followers = data.fan_count ?? 0
          impressions = data.talking_about_count ?? 0
          // Engagement rate = people talking about / fan count × 100
          engagementRate = followers > 0 ? parseFloat(((impressions / followers) * 100).toFixed(2)) : 0
          synced = true
        }

      } else if (account.platform === 'X') {
        // Twitter API v2 — public_metrics includes follower + tweet counts
        const res = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        })
        if (res.ok) {
          const data = await res.json() as {
            data?: { public_metrics?: { followers_count?: number; tweet_count?: number; listed_count?: number } }
          }
          const metrics = data.data?.public_metrics
          followers = metrics?.followers_count ?? 0
          impressions = metrics?.tweet_count ?? 0
          // listed_count is a reasonable influence proxy when tweet engagement isn't available
          const listed = metrics?.listed_count ?? 0
          engagementRate = followers > 0 ? parseFloat(((listed / Math.max(followers, 1)) * 100).toFixed(2)) : 0
          synced = true
        }

      } else if (account.platform === 'TIKTOK') {
        // TikTok user info endpoint
        const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count', {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        })
        if (res.ok) {
          const data = await res.json() as {
            data?: { user?: { follower_count?: number; likes_count?: number; video_count?: number } }
          }
          const user = data.data?.user
          followers = user?.follower_count ?? 0
          const totalLikes = user?.likes_count ?? 0
          const videoCount = user?.video_count ?? 1
          impressions = videoCount
          // Avg likes per video / followers × 100
          const avgLikesPerVideo = videoCount > 0 ? totalLikes / videoCount : 0
          engagementRate = followers > 0 ? parseFloat(((avgLikesPerVideo / followers) * 100).toFixed(2)) : 0
          synced = true
        }

      } else if (account.platform === 'GOOGLE') {
        // YouTube channel stats via Data API v3
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true`,
          { headers: { Authorization: `Bearer ${account.accessToken}` } },
        )
        if (res.ok) {
          const data = await res.json() as {
            items?: Array<{ statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }>
          }
          const stats = data.items?.[0]?.statistics
          followers = parseInt(stats?.subscriberCount ?? '0', 10)
          impressions = parseInt(stats?.viewCount ?? '0', 10)
          const videoCount = parseInt(stats?.videoCount ?? '1', 10)
          // avg views per video / subscribers × 100
          const avgViews = videoCount > 0 ? impressions / videoCount : 0
          engagementRate = followers > 0 ? parseFloat(((avgViews / followers) * 100).toFixed(2)) : 0
          synced = true
        }
      }

      if (synced) {
        await prisma.analyticsSnapshot.create({
          data: { socialAccountId: account.id, followers, impressions, engagementRate },
        })
        logger.info({ accountId: account.id, platform: account.platform, followers, engagementRate }, 'Analytics synced')
      }
    } catch (err) {
      logger.error({ err, accountId: account.id }, 'Analytics sync failed for account')
    }
  }
}
