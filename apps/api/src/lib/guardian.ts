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

  for (const post of zombies) {
    try {
      // Reset status to SCHEDULED so the worker will pick it up fresh
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'SCHEDULED', errorLog: null },
      })

      // Re-enqueue immediately (short delay to avoid thundering herd)
      await publishPostQueue.add(
        'publish-post',
        { postId: post.id },
        { delay: 2000, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )

      report.fixedPostIds.push(post.id)
      report.zombiesFixed++

      logger.info({ postId: post.id }, '[Guardian] Zombie post re-queued')

      // Notify workspace owners + admins
      const adminIds = await getWorkspaceAdmins(post.workspaceId)
      const truncated = post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '')

      await Promise.all(
        adminIds.map((userId) =>
          notify({
            userId,
            type: 'POST_PUBLISHED',
            title: '⚙️ Auto-fix: Post re-queued',
            body: `A stalled post was automatically re-queued on ${post.platforms.join(', ')}: "${truncated}"`,
            link: '/dashboard/calendar',
          }),
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      report.errors.push(`Post ${post.id}: ${msg}`)
      logger.error({ err, postId: post.id }, '[Guardian] Failed to re-queue zombie post')
    }
  }

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
