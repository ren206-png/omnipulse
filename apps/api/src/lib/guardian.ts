/**
 * Guardian — self-healing system for OmniPulse
 *
 * Scans for zombie posts (SCHEDULED but past due by >10 min), re-queues them,
 * and notifies workspace owners/admins. Called by the guardian worker every 5 min.
 */
import { prisma } from './prisma.js'
import { logger } from './logger.js'
import { publishPostQueue } from './queue.js'
import { notify, getWorkspaceAdmins } from './notify.js'
import type { BulkJobOptions } from 'bullmq'

const ZOMBIE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes past due

export interface GuardianReport {
  zombiesFixed: number
  fixedPostIds: string[]
  errors: string[]
}

export async function detectAndFix(): Promise<GuardianReport> {
  const report: GuardianReport = { zombiesFixed: 0, fixedPostIds: [], errors: [] }

  const cutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MS)

  let zombies: { id: string; workspaceId: string; content: string; platforms: string[] }[] = []

  try {
    zombies = await prisma.scheduledPost.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: cutoff },
      },
      select: {
        id: true,
        workspaceId: true,
        content: true,
        platforms: true,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    report.errors.push(`DB scan failed: ${msg}`)
    logger.error({ err }, '[Guardian] Failed to scan for zombie posts')
    return report
  }

  if (zombies.length === 0) return report

  logger.warn({ count: zombies.length }, '[Guardian] Zombie posts detected — re-queuing')

  try {
    // Batch-reset all zombie posts in one query instead of N individual updates
    await prisma.scheduledPost.updateMany({
      where: { id: { in: zombies.map((p) => p.id) } },
      data: { status: 'SCHEDULED', errorLog: null },
    })

    // Batch-enqueue all zombie posts in one BullMQ call
    const jobs: { name: string; data: { postId: string; workspaceId: string }; opts: BulkJobOptions }[] =
      zombies.map((post, i) => ({
        name: 'publish-post',
        data: { postId: post.id, workspaceId: post.workspaceId },
        opts: { delay: 2000 + i * 200, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      }))
    await publishPostQueue.addBulk(jobs)

    report.fixedPostIds = zombies.map((p) => p.id)
    report.zombiesFixed = zombies.length

    logger.info({ count: zombies.length }, '[Guardian] Zombie posts batch re-queued')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    report.errors.push(`Batch re-queue failed: ${msg}`)
    logger.error({ err }, '[Guardian] Failed to batch re-queue zombie posts')
    return report
  }

  // Notify workspace admins (grouped by workspaceId to avoid redundant queries)
  const workspaceIds = [...new Set(zombies.map((p) => p.workspaceId))]
  await Promise.allSettled(
    workspaceIds.map(async (workspaceId) => {
      try {
        const adminIds = await getWorkspaceAdmins(workspaceId)
        const postsInWs = zombies.filter((p) => p.workspaceId === workspaceId)
        await Promise.allSettled(
          adminIds.map((userId) =>
            notify({
              userId,
              type: 'POST_PUBLISHED',
              title: `⚙️ Auto-fix: ${postsInWs.length} post(s) re-queued`,
              body: `${postsInWs.length} stalled post(s) were automatically re-queued.`,
              link: '/dashboard/calendar',
            }),
          ),
        )
      } catch (err) {
        logger.error({ err, workspaceId }, '[Guardian] Failed to send re-queue notifications')
      }
    }),
  )

  return report
}

export async function remindPendingReviews(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago

  const stalePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'PENDING_REVIEW',
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      workspaceId: true,
      content: true,
      platforms: true,
      submittedBy: true,
    },
  })

  if (stalePosts.length === 0) return

  logger.info({ count: stalePosts.length }, '[Guardian] Sending approval reminder notifications')

  for (const post of stalePosts) {
    try {
      const adminIds = await getWorkspaceAdmins(post.workspaceId)
      const truncated = post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '')

      await Promise.all(
        adminIds.map((userId) =>
          notify({
            userId,
            type: 'POST_SUBMITTED_REVIEW',
            title: '⏰ Post awaiting your review',
            body: `A post has been waiting for approval for over 24 hours: "${truncated}"`,
            link: '/dashboard/approvals',
          }),
        ),
      )
    } catch (err) {
      logger.error({ err, postId: post.id }, '[Guardian] Failed to send approval reminder')
    }
  }
}
