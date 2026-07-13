import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { FF_PHOTO_TO_POST } from '../lib/featureFlags.js'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { checkPhotoGuardrails, generatePostVariants, saveVariantsAsDrafts } from '../integrations/photoToPost/photoToPostService.js'
import { DirectUploadProvider } from '../integrations/photoToPost/PhotoIntakeProvider.js'

const router = Router()
router.use(requireAuth)

// Feature-flag gate: all routes under this router return 404 when flag is off
router.use((_req: Request, res: Response, next: () => void): void => {
  if (!FF_PHOTO_TO_POST) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Feature not available' })
    return
  }
  next()
})

// Helper: verify the authenticated user is a member or owner of the workspace.
// Returns the workspace row (with brandName + socialAccounts) or null.
async function getWorkspaceMembership(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { socialAccounts: { select: { platform: true } } },
  })
  if (!workspace) return null
  if (workspace.ownerId === userId) return workspace

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return member ? workspace : null
}

// ── POST /api/v1/photo-to-post/analyze ──────────────────────────────────────
// Guardrails check only — returns flags, no post created.
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const { photoUrl, workspaceId } = req.body as { photoUrl?: string; workspaceId?: string }

  if (!photoUrl) { sendError(res, 400, 'MISSING_FIELD', 'photoUrl is required'); return }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }

  const workspace = await getWorkspaceMembership(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  // Basic URL validation
  const provider = new DirectUploadProvider()
  const validation = await provider.validate({ photoUrl, workspaceId, uploadedBy: req.user!.id })
  if (!validation.valid) { sendError(res, 400, 'INVALID_PHOTO_URL', validation.reason ?? 'Invalid photo URL'); return }

  if (!env.ANTHROPIC_API_KEY) { sendError(res, 503, 'AI_UNAVAILABLE', 'AI service not configured'); return }

  try {
    const guardrails = await checkPhotoGuardrails(photoUrl, env.ANTHROPIC_API_KEY)
    logger.info({ workspaceId, photoUrl, flagged: guardrails.flagged }, 'Photo guardrails check')
    res.json({ guardrails })
  } catch (err) {
    logger.error({ err }, 'Photo analyze error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to analyze photo')
  }
})

// ── POST /api/v1/photo-to-post/generate ─────────────────────────────────────
// Full flow: guardrails + variant generation + save as DRAFT posts.
router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  const {
    photoUrl,
    workspaceId,
    jobEventId,
    platforms: requestedPlatforms,
    proceedDespiteFlags,
  } = req.body as {
    photoUrl?: string
    workspaceId?: string
    jobEventId?: string
    platforms?: string[]
    proceedDespiteFlags?: boolean
  }

  if (!photoUrl) { sendError(res, 400, 'MISSING_FIELD', 'photoUrl is required'); return }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }

  // Workspace membership check — uses session userId, NOT the workspaceId from body unchecked
  const workspace = await getWorkspaceMembership(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  // Basic URL validation
  const provider = new DirectUploadProvider()
  const validation = await provider.validate({ photoUrl, workspaceId, uploadedBy: req.user!.id })
  if (!validation.valid) { sendError(res, 400, 'INVALID_PHOTO_URL', validation.reason ?? 'Invalid photo URL'); return }

  if (!env.ANTHROPIC_API_KEY) { sendError(res, 503, 'AI_UNAVAILABLE', 'AI service not configured'); return }

  try {
    // Step 1: Guardrails — always run, even when proceedDespiteFlags=true
    const guardrails = await checkPhotoGuardrails(photoUrl, env.ANTHROPIC_API_KEY)
    logger.info({ workspaceId, photoUrl, flagged: guardrails.flagged }, 'Photo guardrails check')

    if (guardrails.flagged && proceedDespiteFlags !== true) {
      // Frontend should show a confirmation UI
      res.json({ flagged: true, flagReasons: guardrails.flagReasons, draftsCreated: [] })
      return
    }

    // Step 2: Resolve job context from IngestedJobEvent if provided
    let jobContext: { city?: string; jobType?: string } | undefined
    if (jobEventId) {
      try {
        const event = await prisma.ingestedJobEvent.findFirst({
          where: { id: jobEventId, workspaceId },
          select: { city: true, jobType: true },
        })
        if (event) {
          jobContext = {
            city: event.city ?? undefined,
            jobType: event.jobType ?? undefined,
          }
        }
      } catch (err) {
        logger.warn({ err, jobEventId }, 'Failed to fetch job event — proceeding without context')
      }
    }

    // Step 3: Determine target platforms — use workspace's connected accounts or requested list
    const connectedPlatforms = workspace.socialAccounts.map((a) => a.platform as string)
    const platforms =
      requestedPlatforms && requestedPlatforms.length > 0
        ? requestedPlatforms
        : connectedPlatforms.length > 0
        ? connectedPlatforms
        : ['FACEBOOK', 'INSTAGRAM']

    // Step 4: Generate post variants
    const variantResult = await generatePostVariants({
      photoUrl,
      workspaceId,
      brandName: workspace.brandName ?? null,
      platforms,
      jobContext,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    })

    if (!variantResult.success || !variantResult.variants) {
      sendError(res, 500, 'AI_GENERATION_FAILED', variantResult.reason ?? 'Failed to generate post variants')
      return
    }

    // Step 5: Save as DRAFT — never auto-publish
    const draftIds = await saveVariantsAsDrafts({
      variants: variantResult.variants,
      photoUrl,
      workspaceId,
      prismaClient: prisma,
    })

    logger.info({ workspaceId, draftCount: draftIds.length, flagged: guardrails.flagged }, 'Photo-to-post drafts created')
    res.status(201).json({
      flagged: guardrails.flagged,
      flagReasons: guardrails.flagReasons,
      draftsCreated: draftIds,
      variants: variantResult.variants,
    })
  } catch (err) {
    logger.error({ err }, 'Photo-to-post generate error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate posts from photo')
  }
})

// ── GET /api/v1/photo-to-post/drafts ────────────────────────────────────────
// List DRAFT posts created via photo-to-post (identified by non-empty mediaUrls).
router.get('/drafts', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId query param is required'); return }

  const workspace = await getWorkspaceMembership(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied'); return }

  try {
    const drafts = await (prisma.scheduledPost.findMany as Function)({
      where: {
        workspaceId,
        status: 'DRAFT',
        // Photo-to-post drafts always have a mediaUrl
        mediaUrls: { isEmpty: false },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        platforms: true,
        mediaUrls: true,
        scheduledFor: true,
        status: true,
        createdAt: true,
      },
    })
    res.json({ drafts })
  } catch (err) {
    logger.error({ err }, 'Photo-to-post drafts list error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list photo-to-post drafts')
  }
})

export default router
