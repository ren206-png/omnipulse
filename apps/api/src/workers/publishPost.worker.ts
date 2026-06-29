import 'dotenv/config'
import { Worker } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { redisConnection } from '../lib/queue.js'
import { notify } from '../lib/notify.js'
import { emitWebhook } from '../lib/webhookEmitter.js'

async function publishToPlatform(
  post: { content: string; mediaUrls: string[] },
  account: { platform: string; accessToken: string; externalProfileId: string },
): Promise<string> {
  const { platform, accessToken } = account
  const content = post.content

  if (platform === 'X') {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content.substring(0, 280) }),
    })
    const data = await res.json() as { data?: { id?: string }; detail?: string }
    if (!res.ok) throw new Error(data.detail ?? 'X post failed')
    return data.data?.id ?? ''
  }

  if (platform === 'FACEBOOK') {
    const res = await fetch(`https://graph.facebook.com/me/feed?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content }),
    })
    const data = await res.json() as { id?: string; error?: { message?: string } }
    if (!res.ok) throw new Error(data.error?.message ?? 'Facebook post failed')
    return data.id ?? ''
  }

  if (platform === 'INSTAGRAM') {
    // Instagram Graph API v20 — Business Account ID is stored as externalProfileId
    const igUserId = account.externalProfileId || 'me'
    if (post.mediaUrls?.length > 0) {
      // Step 1: Create media container
      const containerRes = await fetch(
        `https://graph.facebook.com/v20.0/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: post.mediaUrls[0],
            caption: content,
            access_token: accessToken,
          }),
        },
      )
      const container = await containerRes.json() as { id?: string; error?: { message?: string } }
      if (!containerRes.ok) throw new Error(container.error?.message ?? 'IG container creation failed')
      // Step 2: Publish the container
      const publishRes = await fetch(
        `https://graph.facebook.com/v20.0/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: container.id, access_token: accessToken }),
        },
      )
      const published = await publishRes.json() as { id?: string; error?: { message?: string } }
      if (!publishRes.ok) throw new Error(published.error?.message ?? 'IG publish failed')
      return published.id ?? ''
    }
    // Instagram requires media — text-only posts are not supported
    throw new Error('Instagram requires at least one image or video. Add media to publish.')
  }

  // TIKTOK and GOOGLE/YouTube require complex video upload flows — log as pending
  return `${platform}_manual_required`
}

const worker = new Worker(
  'publish-post',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await (prisma.scheduledPost.findUnique as Function)({
      where: { id: postId },
      include: { platformVariants: true },
    })
    if (!post) {
      throw new Error(`ScheduledPost ${postId} not found`)
    }

    // Fetch social accounts for this workspace that match the post's platforms
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId: post.workspaceId, platform: { in: post.platforms } },
    })

    const responseLog: Record<string, string> = {}
    const errors: Record<string, string> = {}

    // Build a lookup of platform → variant (falls back to master content)
    type Variant = { platform: string; content: string; hashtags: string[]; mediaUrls: string[] }
    const variantMap: Record<string, Variant> = {}
    for (const v of (post.platformVariants ?? []) as Variant[]) {
      variantMap[v.platform] = v
    }

    for (const platform of post.platforms) {
      const account = accounts.find((a) => a.platform === platform)
      if (!account) {
        errors[platform] = 'No connected account found for this platform'
        continue
      }
      // Use platform-specific content if available; append hashtags if any
      const variant = variantMap[platform]
      const content = variant
        ? variant.hashtags.length > 0
          ? `${variant.content}\n\n${variant.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ')}`
          : variant.content
        : post.content
      const mediaUrls = variant?.mediaUrls?.length > 0 ? variant.mediaUrls : post.mediaUrls
      try {
        const externalId = await publishToPlatform(
          { content, mediaUrls },
          { platform, accessToken: account.accessToken, externalProfileId: account.externalProfileId },
        )
        responseLog[platform] = externalId
      } catch (err) {
        errors[platform] = err instanceof Error ? err.message : String(err)
      }
    }

    const hasErrors = Object.keys(errors).length > 0
    const allFailed = Object.keys(responseLog).length === 0

    await prisma.scheduledPost.update({
      where: { id: postId },
      data: {
        status: allFailed ? 'FAILED' : 'PUBLISHED',
        responseLog: JSON.stringify(responseLog),
        errorLog: hasErrors ? JSON.stringify(errors) : null,
      },
    })

    // Seed initial metrics (0s) — the analytics-sync worker will fill real numbers later
    await (prisma as unknown as { postMetric: { createMany: (args: unknown) => Promise<unknown> } }).postMetric.createMany({
      data: post.platforms.map((platform) => ({
        postId,
        platform,
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        impressions: 0,
      })),
      skipDuplicates: true,
    })

    if (!allFailed) {
      logger.info({ postId, status: 'PUBLISHED', platforms: post.platforms, responseLog }, 'Post published successfully')
      await emitWebhook(post.workspaceId, 'post.published', { postId: post.id, platforms: post.platforms })

      if (post.submittedBy) {
        await notify({
          userId: post.submittedBy,
          type: 'POST_PUBLISHED',
          title: 'Post published!',
          body: `Your post went live on ${post.platforms.join(', ')}: "${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`,
          link: '/dashboard/calendar',
        })
      }
    } else {
      const errorSummary = Object.entries(errors).map(([p, e]) => `${p}: ${e}`).join('; ')
      logger.error({ postId, status: 'FAILED', platforms: post.platforms, errors }, 'Post publish failed')

      if (post.submittedBy) {
        await notify({
          userId: post.submittedBy,
          type: 'POST_FAILED',
          title: 'Post failed to publish',
          body: `Your post could not be published on ${post.platforms.join(', ')}: "${post.content.slice(0, 50)}${post.content.length > 50 ? '…' : ''}"`,
          link: '/dashboard/calendar',
        })
      }

      throw new Error(errorSummary)
    }
  },
  { connection: redisConnection },
)

worker.on('ready', () => {
  logger.info('BullMQ worker registered: publish-post')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'publish-post job failed permanently')
})

export { worker as publishPostWorker }
