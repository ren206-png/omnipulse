import { FF_PUBLISH_RELIABILITY } from './featureFlags.js'
import { prisma } from './prisma.js'
import { logger } from './logger.js'
import { notify, getWorkspaceAdmins } from './notify.js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_placeholder')

const MAX_ATTEMPTS = 3

function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeDlq(params: {
  postId: string
  workspaceId: string
  platform: string
  errorCode?: number
  errorMessage: string
  attempts: number
}): Promise<string> {
  const entry = await (prisma as any).postDlq.create({
    data: {
      postId: params.postId,
      workspaceId: params.workspaceId,
      platform: params.platform,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage,
      attempts: params.attempts,
    },
  })
  return entry.id
}

async function notifyFailure(params: {
  postId: string
  workspaceId: string
  platform: string
  errorMessage: string
  dlqId: string
}): Promise<void> {
  try {
    const adminIds = await getWorkspaceAdmins(params.workspaceId)
    await Promise.allSettled(
      adminIds.map((userId) =>
        notify({
          userId,
          type: 'POST_FAILED',
          title: 'Post failed to publish',
          body: `Post ${params.postId} failed on ${params.platform}: ${params.errorMessage.slice(0, 120)}`,
          link: '/dashboard/calendar',
        }),
      ),
    )
  } catch (err) {
    logger.error({ err }, '[reliablePublish] Failed to send in-app notifications')
  }

  // Email notification: send to workspace owner
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { owner: { select: { email: true } } },
    })
    const ownerEmail = workspace?.owner?.email
    if (ownerEmail) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
        to: ownerEmail,
        subject: 'OmniPulse: Post failed to publish',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
            <h2 style="color:#1f2937">Post publish failure</h2>
            <p style="color:#4b5563">Post <strong>${params.postId}</strong> could not be published to <strong>${params.platform}</strong>.</p>
            <p style="color:#4b5563">Error: ${params.errorMessage.slice(0, 200)}</p>
            <p style="color:#9ca3af;font-size:12px">DLQ entry ID: ${params.dlqId}. Visit your dashboard to retry or resolve.</p>
          </div>
        `,
      })
    }
  } catch (err) {
    logger.error({ err }, '[reliablePublish] Failed to send failure email')
  }
}

export async function reliablePublish(params: {
  postId: string
  workspaceId: string
  platform: string
  publishFn: () => Promise<{ success: boolean; error?: string; statusCode?: number }>
}): Promise<{ success: boolean; dlqId?: string }> {
  // Feature flag guard: pass-through if flag is off
  if (!FF_PUBLISH_RELIABILITY) {
    const result = await params.publishFn()
    return { success: result.success }
  }

  let lastError = ''
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Idempotency check: if post already published, skip and return success
    const post = await (prisma as any).scheduledPost.findUnique({
      where: { id: params.postId },
      select: { status: true },
    })
    if (post?.status === 'PUBLISHED') {
      logger.info({ postId: params.postId, attempt }, '[reliablePublish] Post already published — skipping duplicate publish')
      return { success: true }
    }

    try {
      const result = await params.publishFn()
      if (result.success) {
        return { success: true }
      }

      lastError = result.error ?? 'Unknown error'
      lastStatusCode = result.statusCode

      // 4xx = terminal — no retry
      const is4xx = result.statusCode !== undefined && result.statusCode >= 400 && result.statusCode < 500
      if (is4xx) {
        logger.warn(
          { postId: params.postId, platform: params.platform, statusCode: result.statusCode, error: lastError },
          '[reliablePublish] Terminal 4xx error — moving to DLQ',
        )
        break
      }

      // 5xx / timeout — retry with backoff (unless last attempt)
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = backoffDelay(attempt)
        logger.warn(
          { postId: params.postId, platform: params.platform, attempt, delay: Math.round(delay), error: lastError },
          '[reliablePublish] Retryable error — backing off',
        )
        await sleep(delay)
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // Treat thrown exceptions like 5xx (network/timeout)
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = backoffDelay(attempt)
        logger.warn(
          { postId: params.postId, platform: params.platform, attempt, delay: Math.round(delay), err: lastError },
          '[reliablePublish] Exception — backing off',
        )
        await sleep(delay)
      }
    }
  }

  // Terminal failure: write DLQ, notify, mark post failed
  logger.error(
    { postId: params.postId, platform: params.platform, error: lastError, statusCode: lastStatusCode },
    '[reliablePublish] All attempts exhausted — writing to DLQ',
  )

  const dlqId = await writeDlq({
    postId: params.postId,
    workspaceId: params.workspaceId,
    platform: params.platform,
    errorCode: lastStatusCode,
    errorMessage: lastError,
    attempts: MAX_ATTEMPTS,
  })

  // Update post status to failed
  try {
    await (prisma as any).scheduledPost.update({
      where: { id: params.postId },
      data: { status: 'FAILED', errorLog: JSON.stringify({ [params.platform]: lastError }) },
    })
  } catch (err) {
    logger.error({ err, postId: params.postId }, '[reliablePublish] Failed to update post status to FAILED')
  }

  // Send notifications
  await notifyFailure({
    postId: params.postId,
    workspaceId: params.workspaceId,
    platform: params.platform,
    errorMessage: lastError,
    dlqId,
  })

  return { success: false, dlqId }
}
