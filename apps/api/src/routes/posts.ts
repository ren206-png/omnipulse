import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { publishPostQueue } from '../lib/queue.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { PLAN_LIMITS } from '../lib/plans.js'
import type { Plan } from '../lib/plans.js'
import { checkLimit } from '../lib/planLimits.js'
import { notify, notifyMany, getWorkspaceAdmins } from '../lib/notify.js'
import { getNextAvailableSlot } from '../lib/queueScheduler.js'
import { sendPostSubmittedEmail, sendPostApprovedEmail, sendPostRejectedEmail } from '../lib/email.js'

const router = Router()
const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN'] as const

router.use(requireAuth)

// Returns the user's role in the workspace, or null if no access
async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return 'OWNER'

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return (membership?.role as 'ADMIN' | 'MEMBER') ?? null
}

// GET /api/v1/posts?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    const posts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId },
      orderBy: { scheduledFor: 'asc' },
      include: { metrics: true, platformVariants: true },
    })
    res.json({ posts })
  } catch (err) {
    logger.error({ err }, 'List posts error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list posts')
  }
})

// GET /api/v1/posts/history?workspaceId=&status=&platform=&search=&page=1&limit=20
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const {
    workspaceId,
    status,
    platform,
    search,
    page: pageStr = '1',
    limit: limitStr = '20',
  } = req.query as {
    workspaceId?: string
    status?: string
    platform?: string
    search?: string
    page?: string
    limit?: string
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  const page = Math.max(1, parseInt(pageStr, 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 20))
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { workspaceId }
  if (status && status !== 'ALL') where.status = status
  if (platform && platform !== 'ALL') where.platforms = { has: platform }
  if (search && search.trim()) {
    where.content = { contains: search.trim(), mode: 'insensitive' }
  }

  try {
    const [rawPosts, total] = await Promise.all([
      (prisma.scheduledPost.findMany as Function)({
        where,
        orderBy: { scheduledFor: 'desc' },
        skip,
        take: limit,
        include: { metrics: true },
      }),
      prisma.scheduledPost.count({ where }),
    ])

    const posts = rawPosts.map((post: {
      id: string
      content: string
      platforms: string[]
      status: string
      scheduledFor: Date
      mediaUrls: string[]
      metrics: Array<{ likes: number; comments: number; shares: number }>
    }) => {
      const totalLikes = post.metrics.reduce((s: number, m: { likes: number }) => s + m.likes, 0)
      const totalComments = post.metrics.reduce((s: number, m: { comments: number }) => s + m.comments, 0)
      const totalShares = post.metrics.reduce((s: number, m: { shares: number }) => s + m.shares, 0)
      return {
        id: post.id,
        content: post.content,
        platforms: post.platforms,
        status: post.status,
        scheduledFor: post.scheduledFor,
        mediaUrls: post.mediaUrls,
        metrics: { likes: totalLikes, comments: totalComments, shares: totalShares },
      }
    })

    res.json({ posts, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    logger.error({ err }, 'Post history error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch post history')
  }
})

// GET /api/v1/posts/pending-review?workspaceId=
router.get('/pending-review', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId query param is required'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  if (role === 'MEMBER') { sendError(res, 403, 'FORBIDDEN', 'Only admins and owners can view the review queue'); return }

  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ posts })
  } catch (err) {
    logger.error({ err }, 'List pending review error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list pending posts')
  }
})

// GET /api/v1/posts/ical?workspaceId=
router.get('/ical', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, scheduledFor: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      orderBy: { scheduledFor: 'asc' },
    })
    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OmniPulse//Social Calendar//EN',
      'CALSCALE:GREGORIAN',
      ...posts.map((p) => {
        const dt = new Date(p.scheduledFor).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
        const summary = p.content.substring(0, 80).replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
        return [
          'BEGIN:VEVENT',
          `UID:${p.id}@omnipulse`,
          `DTSTART:${dt}`,
          `DTEND:${dt}`,
          `SUMMARY:${p.platforms.join('+')} - ${summary}`,
          `DESCRIPTION:${p.content.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')}`,
          `STATUS:${p.status}`,
          'END:VEVENT',
        ].join('\r\n')
      }),
      'END:VCALENDAR',
    ].join('\r\n')
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="omnipulse-calendar.ics"')
    res.send(ical)
  } catch (err) {
    logger.error({ err }, 'iCal export error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to export calendar')
  }
})

// GET /api/v1/posts/calendar?workspaceId=&startDate=&endDate=
router.get('/calendar', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, startDate, endDate } = req.query as { workspaceId?: string; startDate?: string; endDate?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId required'); return }

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end   = endDate   ? new Date(endDate)   : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    const posts = await (prisma.scheduledPost.findMany as Function)({
      where: { workspaceId, scheduledFor: { gte: start, lte: end } },
      orderBy: { scheduledFor: 'asc' },
      select: {
        id: true,
        content: true,
        scheduledFor: true,
        platforms: true,
        status: true,
        mediaUrls: true,
        platformVariants: true,
      },
    })
    res.json({ posts })
  } catch (err) {
    logger.error({ err }, 'Calendar fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch calendar posts')
  }
})

// POST /api/v1/posts/schedule
// Shared type for platform variant input
interface PlatformVariantInput {
  platform: string
  content: string
  hashtags?: string[]
  mediaUrls?: string[]
}

// Validate and normalise platformVariants from request body.
// Returns an error string if invalid, or the cleaned array if valid.
function validateVariants(raw: unknown): { variants: PlatformVariantInput[]; error?: never } | { error: string; variants?: never } {
  if (!raw) return { variants: [] }
  if (!Array.isArray(raw)) return { error: 'platformVariants must be an array' }
  const ALLOWED = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X']
  const seen = new Set<string>()
  const out: PlatformVariantInput[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || !v) continue
    const item = v as Record<string, unknown>
    if (typeof item.platform !== 'string' || !ALLOWED.includes(item.platform)) {
      return { error: `platformVariants: invalid platform "${item.platform}". Allowed: ${ALLOWED.join(', ')}` }
    }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      return { error: `platformVariants: content is required for platform ${item.platform}` }
    }
    if (item.platform === 'X' && item.content.length > 280) {
      return { error: `X platform content exceeds 280 characters (got ${item.content.length})` }
    }
    // Deduplicate — keep last occurrence
    seen.add(item.platform)
    const existing = out.findIndex((e) => e.platform === item.platform)
    const entry: PlatformVariantInput = {
      platform: item.platform,
      content: (item.content as string).trim(),
      hashtags: Array.isArray(item.hashtags) ? (item.hashtags as string[]) : [],
      mediaUrls: Array.isArray(item.mediaUrls) ? (item.mediaUrls as string[]) : [],
    }
    if (existing >= 0) out[existing] = entry
    else out.push(entry)
  }
  return { variants: out }
}

router.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, content, mediaUrls, platforms, scheduledFor, firstComment, platformVariants } = req.body as {
    workspaceId?: string
    content?: string
    mediaUrls?: string[]
    platforms?: string[]
    scheduledFor?: string
    firstComment?: string
    platformVariants?: unknown
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!content || content.trim().length === 0) { sendError(res, 400, 'MISSING_FIELD', 'content is required'); return }
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'platforms array is required'); return }
  if (!scheduledFor) { sendError(res, 400, 'MISSING_FIELD', 'scheduledFor is required'); return }

  const invalidPlatforms = platforms.filter((p) => !VALID_PLATFORMS.includes(p as typeof VALID_PLATFORMS[number]))
  if (invalidPlatforms.length > 0) { sendError(res, 400, 'INVALID_PLATFORM', `Invalid platforms: ${invalidPlatforms.join(', ')}`); return }

  const scheduledDate = new Date(scheduledFor)
  if (isNaN(scheduledDate.getTime())) { sendError(res, 400, 'INVALID_DATE', 'scheduledFor must be a valid ISO 8601 datetime'); return }
  if (scheduledDate.getTime() <= Date.now()) { sendError(res, 400, 'DATE_IN_PAST', 'scheduledFor must be in the future'); return }

  const { variants, error: variantError } = validateVariants(platformVariants)
  if (variantError) { sendError(res, 400, 'INVALID_VARIANT', variantError); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    const { allowed, limit, current } = await checkLimit(prisma, workspaceId, 'scheduledPosts')
    if (!allowed) {
      sendError(res, 403, 'PLAN_LIMIT', `Plan limit reached: ${current}/${limit} posts this month. Upgrade to schedule more.`)
      return
    }

    // Members submit for review; owners/admins schedule directly
    const isPrivileged = role === 'OWNER' || role === 'ADMIN'
    const status = isPrivileged ? 'SCHEDULED' : 'PENDING_REVIEW'

    const post = await (prisma.scheduledPost.create as Function)({
      data: {
        workspaceId,
        content: content.trim(),
        mediaUrls: mediaUrls ?? [],
        platforms: platforms as (typeof VALID_PLATFORMS[number])[],
        scheduledFor: scheduledDate,
        status,
        submittedBy: req.user!.id,
        ...(firstComment?.trim() ? { firstComment: firstComment.trim() } : {}),
        ...(variants!.length > 0 ? {
          platformVariants: {
            create: variants!.map((v) => ({
              platform: v.platform,
              content: v.content,
              hashtags: v.hashtags ?? [],
              mediaUrls: v.mediaUrls ?? [],
            })),
          },
        } : {}),
      },
      include: { platformVariants: true },
    })

    let jobId: string | undefined
    if (isPrivileged) {
      const delay = scheduledDate.getTime() - Date.now()
      const job = await publishPostQueue.add(
        'publish-post',
        { postId: post.id },
        { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
      jobId = job.id
      logger.info({ postId: post.id, jobId: job.id, delay }, 'BullMQ job enqueued')
    } else {
      logger.info({ postId: post.id }, 'Post submitted for review')
    }

    res.status(201).json({ post, jobId, requiresReview: !isPrivileged })
  } catch (err) {
    logger.error({ err }, 'Schedule post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to schedule post')
  }
})

// POST /api/v1/posts/queue-schedule
// Takes a post payload, finds next open queue slot, and creates the post.
router.post('/queue-schedule', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, content, mediaUrls, platforms, firstComment, platformVariants } = req.body as {
    workspaceId?: string
    content?: string
    mediaUrls?: string[]
    platforms?: string[]
    firstComment?: string
    platformVariants?: unknown
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!content || content.trim().length === 0) { sendError(res, 400, 'MISSING_FIELD', 'content is required'); return }
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'platforms array is required'); return }

  const invalidPlatforms = platforms.filter((p) => !VALID_PLATFORMS.includes(p as typeof VALID_PLATFORMS[number]))
  if (invalidPlatforms.length > 0) { sendError(res, 400, 'INVALID_PLATFORM', `Invalid platforms: ${invalidPlatforms.join(', ')}`); return }

  const { variants, error: variantError } = validateVariants(platformVariants)
  if (variantError) { sendError(res, 400, 'INVALID_VARIANT', variantError); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    // Load active queue slots for this workspace
    const activeSlots = await (prisma.queueSlot.findMany as Function)({
      where: { workspaceId, isActive: true },
    })

    if (activeSlots.length === 0) {
      sendError(res, 422, 'NO_QUEUE_SLOTS', 'No queue slots configured. Add at least one slot before using the queue.')
      return
    }

    // Load existing scheduled timestamps to check conflicts
    const existingPosts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: { in: ['SCHEDULED', 'QUEUED'] } },
      select: { scheduledFor: true },
    })
    const occupied = new Set(existingPosts.map((p) => p.scheduledFor.toISOString()))

    const nextSlot = getNextAvailableSlot(activeSlots, occupied)

    if (!nextSlot) {
      sendError(res, 409, 'NO_AVAILABLE_SLOT', 'No open queue slots available in the next 8 weeks.')
      return
    }

    const { allowed, limit, current } = await checkLimit(prisma, workspaceId, 'scheduledPosts')
    if (!allowed) {
      sendError(res, 403, 'PLAN_LIMIT', `Plan limit reached: ${current}/${limit} posts this month.`)
      return
    }

    const isPrivileged = role === 'OWNER' || role === 'ADMIN'
    const status = isPrivileged ? 'SCHEDULED' : 'PENDING_REVIEW'

    const post = await (prisma.scheduledPost.create as Function)({
      data: {
        workspaceId,
        content: content.trim(),
        mediaUrls: mediaUrls ?? [],
        platforms: platforms as (typeof VALID_PLATFORMS[number])[],
        scheduledFor: nextSlot,
        status,
        submittedBy: req.user!.id,
        ...(firstComment?.trim() ? { firstComment: firstComment.trim() } : {}),
        ...(variants!.length > 0 ? {
          platformVariants: {
            create: variants!.map((v) => ({
              platform: v.platform,
              content: v.content,
              hashtags: v.hashtags ?? [],
              mediaUrls: v.mediaUrls ?? [],
            })),
          },
        } : {}),
      },
      include: { platformVariants: true },
    })

    let jobId: string | undefined
    if (isPrivileged) {
      const delay = nextSlot.getTime() - Date.now()
      const job = await publishPostQueue.add(
        'publish-post',
        { postId: post.id },
        { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
      jobId = job.id
      logger.info({ postId: post.id, scheduledFor: nextSlot, jobId }, 'Queue-scheduled post enqueued')
    }

    res.status(201).json({ post, jobId, scheduledFor: nextSlot, requiresReview: !isPrivileged })
  } catch (err) {
    logger.error({ err }, 'Queue schedule error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to queue-schedule post')
  }
})

// POST /api/v1/posts/bulk-schedule
router.post('/bulk-schedule', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, posts } = req.body as {
    workspaceId?: string
    posts?: Array<{
      content: string
      platforms: string[]
      scheduledFor: string
      mediaUrls?: string[]
    }>
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!Array.isArray(posts) || posts.length === 0) { sendError(res, 400, 'MISSING_FIELD', 'posts array is required'); return }
  if (posts.length > 200) { sendError(res, 400, 'TOO_MANY', 'Maximum 200 posts per bulk import'); return }

  const role = await getWorkspaceRole(workspaceId, req.user!.id)
  if (!role) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  // Plan limit check — count existing scheduled posts
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (workspace) {
    const limits = PLAN_LIMITS[workspace.plan as Plan]
    if (limits.scheduledPosts !== Infinity) {
      const existing = await prisma.scheduledPost.count({
        where: { workspaceId, status: { in: ['SCHEDULED', 'PENDING_REVIEW', 'DRAFT'] } },
      })
      if (existing + posts.length > limits.scheduledPosts) {
        sendError(res, 402, 'PLAN_LIMIT', `Your ${workspace.plan} plan allows up to ${limits.scheduledPosts} scheduled posts. Upgrade to schedule more.`)
        return
      }
    }
  }

  const isPrivileged = role === 'OWNER' || role === 'ADMIN'

  // Validate all rows first — return errors before touching the DB
  const rowErrors: Array<{ row: number; errors: string[] }> = []

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]
    const errs: string[] = []
    if (!p.content || !p.content.trim()) errs.push('content is required')
    if (!Array.isArray(p.platforms) || p.platforms.length === 0) errs.push('at least one platform is required')
    else {
      const bad = p.platforms.filter((pl) => !VALID_PLATFORMS.includes(pl as typeof VALID_PLATFORMS[number]))
      if (bad.length > 0) errs.push(`invalid platforms: ${bad.join(', ')}`)
    }
    if (!p.scheduledFor) {
      errs.push('scheduledFor is required')
    } else {
      const d = new Date(p.scheduledFor)
      if (isNaN(d.getTime())) errs.push('scheduledFor is not a valid date')
      else if (d.getTime() <= Date.now()) errs.push('scheduledFor must be in the future')
    }
    if (errs.length > 0) rowErrors.push({ row: i + 1, errors: errs })
  }

  if (rowErrors.length > 0) {
    res.status(422).json({ error: 'Validation failed', rowErrors })
    return
  }

  // Insert all posts in a single transaction
  try {
    const created = await prisma.$transaction(
      posts.map((p) =>
        prisma.scheduledPost.create({
          data: {
            workspaceId,
            content: p.content.trim(),
            platforms: p.platforms as (typeof VALID_PLATFORMS[number])[],
            scheduledFor: new Date(p.scheduledFor),
            mediaUrls: p.mediaUrls?.filter(Boolean) ?? [],
            status: isPrivileged ? 'SCHEDULED' : 'PENDING_REVIEW',
            submittedBy: req.user!.id,
          },
        }),
      ),
    )

    // Enqueue BullMQ jobs for privileged users
    if (isPrivileged) {
      await Promise.all(
        created.map((post) => {
          const delay = post.scheduledFor.getTime() - Date.now()
          return publishPostQueue.add(
            'publish-post',
            { postId: post.id },
            { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
          )
        }),
      )
    }

    logger.info({ workspaceId, count: created.length, isPrivileged }, 'Bulk posts created')
    await notify({
      userId: req.user!.id,
      type: 'POST_PUBLISHED',
      title: `${created.length} post${created.length !== 1 ? 's' : ''} scheduled`,
      body: `Your bulk import of ${created.length} post${created.length !== 1 ? 's' : ''} has been queued successfully.`,
      link: '/dashboard/calendar',
    })
    res.status(201).json({
      created: created.length,
      requiresReview: !isPrivileged,
      posts: created.map((p) => ({ id: p.id, status: p.status, scheduledFor: p.scheduledFor })),
    })
  } catch (err) {
    logger.error({ err }, 'Bulk schedule error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to bulk schedule posts')
  }
})

// POST /api/v1/posts/:id/submit-review — member submits a DRAFT for review
router.post('/:id/submit-review', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    if (post.status !== 'DRAFT') {
      sendError(res, 400, 'INVALID_STATUS', 'Only DRAFT posts can be submitted for review')
      return
    }

    const updated = await prisma.scheduledPost.update({
      where: { id },
      data: { status: 'PENDING_REVIEW', submittedBy: req.user!.id },
    })
    logger.info({ postId: id, userId: req.user!.id }, 'Post submitted for review')

    // Notify admins/owners
    const adminIds = await getWorkspaceAdmins(post.workspaceId)
    const submitterIds = adminIds.filter((uid) => uid !== req.user!.id)
    await notifyMany(submitterIds.map((userId) => ({
      userId,
      type: 'POST_SUBMITTED_REVIEW' as const,
      title: 'Post awaiting review',
      body: `A post has been submitted for your approval: "${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`,
      link: '/dashboard/approvals',
    })))

    // Email admins/owners (fire-and-forget)
    void (async () => {
      try {
        const [submitter, workspace, adminUsers] = await Promise.all([
          prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } }),
          prisma.workspace.findUnique({ where: { id: post.workspaceId }, select: { name: true } }),
          prisma.user.findMany({ where: { id: { in: submitterIds } }, select: { email: true } }),
        ])
        const appUrl = process.env.WEB_URL ?? 'http://localhost:3000'
        await Promise.all(adminUsers.map((u) =>
          sendPostSubmittedEmail({
            to: u.email,
            submitterEmail: submitter?.email ?? 'A team member',
            postContent: post.content,
            workspaceName: workspace?.name ?? 'your workspace',
            approvalsUrl: `${appUrl}/dashboard/approvals`,
          })
        ))
      } catch (e) {
        logger.error({ e }, 'Failed to send post-submitted emails')
      }
    })()

    res.json({ post: updated })
  } catch (err) {
    logger.error({ err }, 'Submit review error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit post for review')
  }
})

// POST /api/v1/posts/:id/approve — admin/owner approves
router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role || role === 'MEMBER') { sendError(res, 403, 'FORBIDDEN', 'Only admins and owners can approve posts'); return }

    if (post.status !== 'PENDING_REVIEW') {
      sendError(res, 400, 'INVALID_STATUS', 'Only PENDING_REVIEW posts can be approved')
      return
    }

    if (post.scheduledFor.getTime() <= Date.now()) {
      sendError(res, 400, 'DATE_IN_PAST', 'Scheduled time has passed — edit the post before approving')
      return
    }

    const updated = await prisma.scheduledPost.update({
      where: { id },
      data: { status: 'SCHEDULED', reviewedBy: req.user!.id, reviewNote: null },
    })

    const delay = post.scheduledFor.getTime() - Date.now()
    const job = await publishPostQueue.add(
      'publish-post',
      { postId: post.id },
      { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    )

    logger.info({ postId: id, jobId: job.id }, 'Post approved and enqueued')

    // Notify the original submitter
    if (post.submittedBy && post.submittedBy !== req.user!.id) {
      await notify({
        userId: post.submittedBy,
        type: 'POST_APPROVED',
        title: 'Your post was approved',
        body: `Your post has been approved and is now scheduled: "${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`,
        link: '/dashboard/calendar',
      })

      // Email the submitter (fire-and-forget)
      void prisma.user.findUnique({ where: { id: post.submittedBy }, select: { email: true } }).then((u) => {
        if (u) {
          const appUrl = process.env.WEB_URL ?? 'http://localhost:3000'
          return sendPostApprovedEmail({ to: u.email, postContent: post.content, calendarUrl: `${appUrl}/dashboard/calendar` })
        }
      }).catch((e) => logger.error({ e }, 'Failed to send post-approved email'))
    }

    res.json({ post: updated, jobId: job.id })
  } catch (err) {
    logger.error({ err }, 'Approve post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve post')
  }
})

// POST /api/v1/posts/:id/reject — admin/owner rejects with note
router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { note } = req.body as { note?: string }

  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role || role === 'MEMBER') { sendError(res, 403, 'FORBIDDEN', 'Only admins and owners can reject posts'); return }

    if (post.status !== 'PENDING_REVIEW') {
      sendError(res, 400, 'INVALID_STATUS', 'Only PENDING_REVIEW posts can be rejected')
      return
    }

    const updated = await prisma.scheduledPost.update({
      where: { id },
      data: { status: 'DRAFT', reviewedBy: req.user!.id, reviewNote: note?.trim() ?? null },
    })
    logger.info({ postId: id }, 'Post rejected')

    // Notify the original submitter
    if (post.submittedBy && post.submittedBy !== req.user!.id) {
      await notify({
        userId: post.submittedBy,
        type: 'POST_REJECTED',
        title: 'Your post needs changes',
        body: note?.trim()
          ? `Feedback: "${note.trim()}" — Post: "${post.content.slice(0, 40)}${post.content.length > 40 ? '…' : ''}"`
          : `Your post was sent back for revisions: "${post.content.slice(0, 60)}${post.content.length > 60 ? '…' : ''}"`,
        link: '/dashboard/calendar',
      })

      // Email the submitter (fire-and-forget)
      void prisma.user.findUnique({ where: { id: post.submittedBy }, select: { email: true } }).then((u) => {
        if (u) {
          const appUrl = process.env.WEB_URL ?? 'http://localhost:3000'
          return sendPostRejectedEmail({ to: u.email, postContent: post.content, note: note?.trim(), calendarUrl: `${appUrl}/dashboard/calendar` })
        }
      }).catch((e) => logger.error({ e }, 'Failed to send post-rejected email'))
    }

    res.json({ post: updated })
  } catch (err) {
    logger.error({ err }, 'Reject post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject post')
  }
})

// PATCH /api/v1/posts/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { content, scheduledFor, platformVariants } = req.body as {
    content?: string
    scheduledFor?: string
    platformVariants?: unknown
  }

  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    if (!['SCHEDULED', 'DRAFT'].includes(post.status)) {
      sendError(res, 400, 'INVALID_STATUS', 'Only SCHEDULED or DRAFT posts can be edited')
      return
    }

    const updates: { content?: string; scheduledFor?: Date } = {}

    if (content !== undefined) {
      if (!content.trim()) { sendError(res, 400, 'MISSING_FIELD', 'content cannot be empty'); return }
      updates.content = content.trim()
    }

    if (scheduledFor !== undefined) {
      const d = new Date(scheduledFor)
      if (isNaN(d.getTime())) { sendError(res, 400, 'INVALID_DATE', 'scheduledFor must be a valid ISO 8601 datetime'); return }
      if (d.getTime() <= Date.now()) { sendError(res, 400, 'DATE_IN_PAST', 'scheduledFor must be in the future'); return }
      updates.scheduledFor = d
    }

    // Upsert platformVariants if provided
    if (platformVariants !== undefined) {
      const { variants, error: variantError } = validateVariants(platformVariants)
      if (variantError) { sendError(res, 400, 'INVALID_VARIANT', variantError); return }
      // Delete existing variants for this post, then recreate (clean upsert)
      await (prisma.platformVariant.deleteMany as Function)({ where: { postId: id } })
      if (variants!.length > 0) {
        await (prisma.platformVariant.createMany as Function)({
          data: variants!.map((v) => ({
            postId: id,
            platform: v.platform,
            content: v.content,
            hashtags: v.hashtags ?? [],
            mediaUrls: v.mediaUrls ?? [],
          })),
        })
      }
    }

    const updated = await (prisma.scheduledPost.update as Function)({
      where: { id },
      data: updates,
      include: { platformVariants: true },
    })
    logger.info({ postId: id }, 'Post updated')
    res.json({ post: updated })
  } catch (err) {
    logger.error({ err }, 'Update post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update post')
  }
})

// DELETE /api/v1/posts/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    if (post.status === 'PUBLISHED') {
      sendError(res, 400, 'INVALID_STATUS', 'Published posts cannot be deleted')
      return
    }

    await prisma.scheduledPost.delete({ where: { id } })
    logger.info({ postId: id }, 'Post deleted')
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete post error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete post')
  }
})

// PATCH /api/v1/posts/:id/metrics  — upsert engagement numbers for one platform
router.patch('/:id/metrics', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { platform, likes, comments, shares, reach, impressions } = req.body as {
    platform?: string
    likes?: number
    comments?: number
    shares?: number
    reach?: number
    impressions?: number
  }

  if (!platform) { sendError(res, 400, 'MISSING_FIELD', 'platform is required'); return }

  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const db = prisma as unknown as { postMetric: { upsert: (args: unknown) => Promise<unknown> } }
    const metric = await db.postMetric.upsert({
      where: { postId_platform: { postId: id, platform } },
      create: { postId: id, platform, likes: likes ?? 0, comments: comments ?? 0, shares: shares ?? 0, reach: reach ?? 0, impressions: impressions ?? 0 },
      update: { likes: likes ?? 0, comments: comments ?? 0, shares: shares ?? 0, reach: reach ?? 0, impressions: impressions ?? 0, recordedAt: new Date() },
    })

    res.json({ metric })
  } catch (err) {
    logger.error({ err }, 'Metrics update error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update metrics')
  }
})

// PATCH /api/v1/posts/:id/evergreen — toggle evergreen recycling on a published post
router.patch('/:id/evergreen', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { evergreen, intervalDays } = req.body as { evergreen?: boolean; intervalDays?: number }

  if (typeof evergreen !== 'boolean') { sendError(res, 400, 'MISSING_FIELD', 'evergreen (boolean) is required'); return }
  if (evergreen) {
    if (intervalDays === undefined || intervalDays === null) { sendError(res, 400, 'MISSING_FIELD', 'intervalDays is required when evergreen is true'); return }
    if (!Number.isInteger(intervalDays) || intervalDays < 7 || intervalDays > 365) {
      sendError(res, 400, 'INVALID_FIELD', 'intervalDays must be an integer between 7 and 365'); return
    }
  }

  try {
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
    if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

    const updated = await (prisma.scheduledPost.update as Function)({
      where: { id },
      data: {
        evergreen,
        evergreenInterval: evergreen ? intervalDays : null,
      },
    })
    logger.info({ postId: id, evergreen, intervalDays }, 'Evergreen setting updated')
    res.json({ post: updated })
  } catch (err) {
    logger.error({ err }, 'Evergreen update error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update evergreen setting')
  }
})

// POST /api/v1/posts/:id/ab-test  — create a variant of a post
router.post('/:id/ab-test', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { content } = req.body as { content?: string }
  if (!content) { sendError(res, 400, 'MISSING_CONTENT', 'content required'); return }
  try {
    const original = await (prisma.scheduledPost.findUnique as Function)({ where: { id } })
    if (!original) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: original.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    // Mark original as A/B test active
    await (prisma.scheduledPost.update as Function)({ where: { id }, data: { abTestActive: true } })
    // Create variant
    const variant = await (prisma.scheduledPost.create as Function)({
      data: {
        workspaceId: original.workspaceId,
        content,
        mediaUrls: original.mediaUrls,
        platforms: original.platforms,
        scheduledFor: original.scheduledFor,
        status: 'DRAFT',
        abVariantOf: id,
      },
    })
    res.status(201).json({ variant })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create A/B variant')
  }
})

// GET /api/v1/posts/:id/ab-variants
router.get('/:id/ab-variants', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const original = await (prisma.scheduledPost.findUnique as Function)({ where: { id }, include: { metrics: true } })
    if (!original) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }
    const workspace = await prisma.workspace.findUnique({ where: { id: original.workspaceId } })
    if (!workspace || workspace.ownerId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    const variants = await (prisma.scheduledPost.findMany as Function)({ where: { abVariantOf: id }, include: { metrics: true } })
    res.json({ original, variants })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch variants')
  }
})

export default router
