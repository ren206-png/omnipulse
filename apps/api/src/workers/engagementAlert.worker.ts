/**
 * Engagement Alert Worker
 *
 * After a post publishes, schedule a check 2 hours later.
 * Compare the post's metrics to the workspace average.
 * Notify the author if the post is a standout performer (≥2× avg)
 * or underperformer (≤0.3× avg — excluding brand-new workspaces with no history).
 *
 * Wired up from publishPost.worker.ts after a successful publish.
 */
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/queue.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'
import { notify } from '../lib/notify.js'

export const engagementAlertQueue = new Queue('engagement-alert', { connection: redisConnection })

const CHECK_DELAY_MS = 2 * 60 * 60 * 1000 // 2 hours

/** Schedule a 2-hour engagement check for a post. Safe to call multiple times. */
export async function scheduleEngagementCheck(postId: string): Promise<void> {
  try {
    await engagementAlertQueue.add(
      'check-engagement',
      { postId },
      {
        delay: CHECK_DELAY_MS,
        jobId: `engagement-check-${postId}`, // deduplicate
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
      },
    )
  } catch (err) {
    logger.warn({ err, postId }, '[EngagementAlert] Failed to schedule check')
  }
}

const worker = new Worker(
  'engagement-alert',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await prisma.scheduledPost.findUnique({
      where: { id: postId },
      include: { metrics: true },
    })
    if (!post || post.status !== 'PUBLISHED') return

    const totalEngagement = post.metrics.reduce(
      (sum, m) => sum + m.likes + m.comments + m.shares,
      0,
    )

    // Fetch the workspace average (last 30 posts, excluding this one)
    const recentPosts = await (prisma as any).postMetric.findMany({
      where: {
        post: { workspaceId: post.workspaceId, status: 'PUBLISHED', id: { not: postId } },
      },
      take: 30,
      orderBy: { recordedAt: 'desc' },
    })

    if (recentPosts.length < 3) {
      // Not enough history — skip alert
      return
    }

    const avgEngagement =
      recentPosts.reduce((sum: number, m: { likes: number; comments: number; shares: number }) => sum + m.likes + m.comments + m.shares, 0) /
      recentPosts.length

    if (avgEngagement === 0) return

    const ratio = totalEngagement / avgEngagement
    const truncated = post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '')

    if (!post.submittedBy) return

    if (ratio >= 2) {
      // 🔥 Standout performer
      await notify({
        userId: post.submittedBy,
        type: 'POST_PUBLISHED',
        title: '🔥 Post is on fire!',
        body: `Your post is getting ${Math.round(ratio)}× more engagement than average: "${truncated}"`,
        link: '/dashboard/analytics',
      })
      logger.info({ postId, ratio, totalEngagement, avgEngagement }, '[EngagementAlert] Standout post notified')
    } else if (ratio <= 0.3 && totalEngagement === 0) {
      // ❄️ Underperformer — only alert if truly zero engagement
      await notify({
        userId: post.submittedBy,
        type: 'POST_FAILED',
        title: '📉 Post needs a boost',
        body: `Your post has gotten little engagement 2 hours after publishing. Consider repurposing or resharing: "${truncated}"`,
        link: '/dashboard/content-health',
      })
      logger.info({ postId, ratio, totalEngagement, avgEngagement }, '[EngagementAlert] Underperformer post notified')
    }
  },
  { connection: redisConnection },
)

worker.on('ready', () => {
  logger.info('[EngagementAlert] Worker registered — 2-hour post checks active')
})

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, '[EngagementAlert] Check job failed')
})

export { worker as engagementAlertWorker }
