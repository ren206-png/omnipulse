import 'dotenv/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { redisConnection, publishPostQueue } from '../lib/queue.js'
import { notify } from '../lib/notify.js'
import { emitWebhook } from '../lib/webhookEmitter.js'
import { decryptToken } from '../lib/tokenEncryption.js'
import { isLinkedInTokenExpired, refreshLinkedInToken } from '../lib/linkedinToken.js'
import { publishLinkedInText, publishLinkedInImage, publishLinkedInVideo } from '../lib/linkedinPublisher.js'
import { scheduleEngagementCheck } from './engagementAlert.worker.js'

async function postFirstComment(
  platform: string,
  externalId: string,
  accessToken: string,
  comment: string,
): Promise<void> {
  try {
    if (platform === 'X') {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: comment.substring(0, 280), reply: { in_reply_to_tweet_id: externalId } }),
      })
      if (!res.ok) {
        const err = await res.json() as { detail?: string }
        logger.warn({ platform, externalId, err: err.detail }, 'First comment failed on X')
      }
    } else if (platform === 'FACEBOOK') {
      const res = await fetch(`https://graph.facebook.com/${externalId}/comments?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: comment }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } }
        logger.warn({ platform, externalId, err: err.error?.message }, 'First comment failed on Facebook')
      }
    } else if (platform === 'INSTAGRAM') {
      const res = await fetch(`https://graph.facebook.com/v20.0/${externalId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: comment, access_token: accessToken }),
      })
      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } }
        logger.warn({ platform, externalId, err: err.error?.message }, 'First comment failed on Instagram')
      }
    } else if (platform === 'LINKEDIN') {
      // LinkedIn comments API uses the post URN
      // externalId is the post URN e.g. "urn:li:share:123"
      const res = await fetch(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(externalId)}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202406',
        },
        body: JSON.stringify({
          actor: 'urn:li:person:me',
          message: { text: comment },
        }),
      })
      if (!res.ok) {
        logger.warn({ platform, externalId, status: res.status }, 'First comment failed on LinkedIn')
      }
    }
  } catch (err) {
    // First comment is non-critical — log and continue
    logger.warn({ err, platform, externalId }, 'First comment exception — skipping')
  }
}

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

// ── LinkedIn per-user daily rate limit (95 posts/day conservative) ───────────
let _liRedis: IORedis | null = null
function getLiRedis(): IORedis {
  if (!_liRedis) {
    _liRedis = new IORedis({
      host: redisConnection.host,
      port: redisConnection.port,
      password: redisConnection.password,
      db: redisConnection.db,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    })
  }
  return _liRedis
}

async function checkLinkedInRateLimit(userId: string): Promise<boolean> {
  try {
    const redis = getLiRedis()
    const today = new Date().toISOString().slice(0, 10)
    const count = await redis.get(`linkedin:posts:${userId}:${today}`)
    return (parseInt(count ?? '0', 10)) < 95
  } catch {
    return true // fail open — don't block if Redis unavailable
  }
}

async function incrementLinkedInRateLimit(userId: string): Promise<void> {
  try {
    const redis = getLiRedis()
    const today = new Date().toISOString().slice(0, 10)
    const key = `linkedin:posts:${userId}:${today}`
    await redis.incr(key)
    await redis.expire(key, 90000) // 25 hours TTL
  } catch { /* non-critical */ }
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
      select: {
        id: true,
        platform: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
        externalProfileId: true,
        workspaceId: true,
        linkedinPersonUrn: true,
        linkedinOrganizationUrns: true,
      },
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
      // ── LinkedIn: special dispatch path ────────────────────────────────────
      if (platform === 'LINKEDIN') {
        try {
          // Guard: personUrn must be stored
          const liAccount = account as typeof account & {
            linkedinPersonUrn?: string | null
            tokenExpiresAt?: Date | null
            refreshToken?: string | null
          }
          if (!liAccount.linkedinPersonUrn) {
            errors[platform] = 'linkedin_not_connected'
            continue
          }

          // Guard: check + refresh token if near expiry
          let rawToken = decryptToken(account.accessToken)
          if (isLinkedInTokenExpired({
            id: account.id,
            accessToken: account.accessToken,
            refreshToken: liAccount.refreshToken ?? null,
            tokenExpiresAt: liAccount.tokenExpiresAt ?? null,
            workspaceId: post.workspaceId,
          })) {
            const refreshed = await refreshLinkedInToken(
              {
                id: account.id,
                accessToken: account.accessToken,
                refreshToken: liAccount.refreshToken ?? null,
                tokenExpiresAt: liAccount.tokenExpiresAt ?? null,
                workspaceId: post.workspaceId,
              },
              post.submittedBy ?? null,
            )
            if (!refreshed) {
              errors[platform] = 'linkedin_token_expired'
              continue
            }
            rawToken = refreshed
          }

          // Guard: per-user rate limit (95/day)
          const workspaceOwner = await prisma.workspace.findUnique({
            where: { id: post.workspaceId },
            select: { ownerId: true },
          })
          const ownerId = workspaceOwner?.ownerId ?? post.workspaceId
          const withinLimit = await checkLinkedInRateLimit(ownerId)
          if (!withinLimit) {
            // Reschedule to same time tomorrow
            const tomorrow = new Date(post.scheduledFor.getTime() + 24 * 60 * 60 * 1000)
            await prisma.scheduledPost.update({
              where: { id: post.id },
              data: { status: 'SCHEDULED', scheduledFor: tomorrow },
            })
            if (post.submittedBy) {
              await notify({
                userId: post.submittedBy,
                type: 'POST_FAILED',
                title: 'LinkedIn daily limit reached',
                body: 'LinkedIn daily post limit approaching. This post has been rescheduled to tomorrow at the same time.',
                link: '/dashboard/calendar',
              })
            }
            errors[platform] = 'linkedin_rate_limit_rescheduled'
            continue
          }

          // Dispatch based on media type
          const hasVideo = mediaUrls.some((u: string) => /\.(mp4|mov|avi|webm)$/i.test(u))
          const hasImage = mediaUrls.length > 0 && !hasVideo

          let result
          if (hasVideo) {
            result = await publishLinkedInVideo(
              rawToken,
              liAccount.linkedinPersonUrn,
              content,
              mediaUrls[0],
            )
          } else if (hasImage) {
            result = await publishLinkedInImage(
              rawToken,
              liAccount.linkedinPersonUrn,
              content,
              mediaUrls[0],
              content.slice(0, 120),
            )
          } else {
            result = await publishLinkedInText(rawToken, liAccount.linkedinPersonUrn, content)
          }

          if (result.success) {
            responseLog[platform] = result.postUrn
            await incrementLinkedInRateLimit(ownerId)
          } else if (result.error === 'rate_limit' && result.retryAfter) {
            // Re-queue with Retry-After delay (max 3 auto-retries handled by BullMQ)
            throw new Error(`LINKEDIN_RATE_LIMIT:${result.retryAfter}`)
          } else {
            errors[platform] = result.error
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.startsWith('LINKEDIN_RATE_LIMIT:')) throw err // propagate for BullMQ retry
          errors[platform] = msg
        }
        continue
      }
      // ── End LinkedIn ─────────────────────────────────────────────────────────

      try {
        const externalId = await publishToPlatform(
          { content, mediaUrls },
          { platform, accessToken: account.accessToken, externalProfileId: account.externalProfileId },
        )
        responseLog[platform] = externalId

        // ── X Thread: reply with each subsequent slide ────────────────────────
        if (platform === 'X' && externalId && post.threadSlides) {
          type ThreadSlide = { text?: string; id?: string }
          const slides = post.threadSlides as ThreadSlide[]
          if (Array.isArray(slides) && slides.length > 1) {
            let replyToId = externalId
            for (const slide of slides.slice(1)) {
              const slideText = (slide.text ?? '').substring(0, 280)
              if (!slideText) continue
              try {
                const replyRes = await fetch('https://api.twitter.com/2/tweets', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${account.accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    text: slideText,
                    reply: { in_reply_to_tweet_id: replyToId },
                  }),
                })
                const replyData = await replyRes.json() as { data?: { id?: string }; detail?: string }
                if (!replyRes.ok) {
                  logger.warn({ replyToId, err: replyData.detail }, 'X thread reply failed — stopping thread chain')
                  break
                }
                replyToId = replyData.data?.id ?? replyToId
              } catch (threadErr) {
                logger.warn({ threadErr, replyToId }, 'X thread reply exception — stopping thread chain')
                break
              }
            }
            logger.info({ postId, slides: slides.length }, 'X thread published')
          }
        }
        // ── End X Thread ──────────────────────────────────────────────────────
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

    // Post first comment on each platform that published successfully
    if (post.firstComment?.trim() && Object.keys(responseLog).length > 0) {
      for (const [platform, externalId] of Object.entries(responseLog)) {
        if (!externalId || externalId.includes('_manual_required')) continue
        const account = accounts.find((a) => a.platform === platform)
        if (!account) continue
        // For LinkedIn, use the raw decrypted token
        const accessToken = platform === 'LINKEDIN'
          ? decryptToken(account.accessToken)
          : account.accessToken
        await postFirstComment(platform, externalId, accessToken, post.firstComment)
      }
      logger.info({ postId, platforms: Object.keys(responseLog) }, 'First comment posted')
    }

    // Seed initial metrics (0s) — the analytics-sync worker will fill real numbers later
    await (prisma as unknown as { postMetric: { createMany: (args: unknown) => Promise<unknown> } }).postMetric.createMany({
      data: post.platforms.map((platform: string) => ({
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
      // Schedule 2-hour engagement check
      await scheduleEngagementCheck(postId)

      // ── Recurrence: spawn next occurrence ────────────────────────────────
      if (post.recurrenceFreq) {
        const parentId = post.recurrenceParentId ?? post.id
        const endsAt: Date | null = post.recurrenceEndsAt ?? null

        function nextScheduledFor(base: Date, freq: string): Date {
          const d = new Date(base)
          if (freq === 'daily') {
            d.setDate(d.getDate() + 1)
          } else if (freq === 'weekdays') {
            d.setDate(d.getDate() + 1)
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
          } else if (freq === 'weekly') {
            d.setDate(d.getDate() + 7)
          } else if (freq === 'monthly') {
            d.setMonth(d.getMonth() + 1)
          }
          return d
        }

        const nextDate = nextScheduledFor(post.scheduledFor, post.recurrenceFreq)

        if (!endsAt || nextDate <= endsAt) {
          try {
            const nextPost = await (prisma.scheduledPost.create as Function)({
              data: {
                workspaceId: post.workspaceId,
                content: post.content,
                mediaUrls: post.mediaUrls,
                platforms: post.platforms,
                scheduledFor: nextDate,
                status: 'SCHEDULED',
                submittedBy: post.submittedBy,
                firstComment: post.firstComment,
                recurrenceFreq: post.recurrenceFreq,
                recurrenceEndsAt: post.recurrenceEndsAt,
                recurrenceParentId: parentId,
              },
            })
            const delay = nextDate.getTime() - Date.now()
            await publishPostQueue.add(
              'publish-post',
              { postId: nextPost.id },
              { delay: Math.max(delay, 1000), attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
            )
            logger.info({ postId: nextPost.id, scheduledFor: nextDate, freq: post.recurrenceFreq }, 'Recurring post spawned')
          } catch (recErr) {
            logger.error({ recErr, postId }, 'Failed to spawn next recurring occurrence')
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

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

// Note: global crash handlers registered once in index.ts — avoid duplicate listeners.

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'publish-post job failed permanently')
})

export { worker as publishPostWorker }
