import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { generateSeoMetadata } from '../services/seo/metadataEngine.js'

const router = Router()
router.use(requireAuth)

async function checkSeoAccess(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ])
  return !!(ws && (ws.ownerId === userId || member))
}

// GET /api/v1/seo/:postId?workspaceId=...
router.get('/:postId', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkSeoAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const seo = await (prisma as any).postSeoMetadata.findFirst({
      where: { postId, workspaceId },
    })
    res.json({ seo: seo ?? null })
  } catch (err) {
    logger.error({ err }, '[seo] GET failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch SEO metadata')
  }
})

// POST /api/v1/seo/:postId/generate — trigger AI generation and persist
router.post('/:postId/generate', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId } = req.body as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkSeoAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, workspaceId },
      select: { content: true, platforms: true },
    })
    if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

    const generated = await generateSeoMetadata(post.content, {
      platforms: post.platforms as string[],
      workspaceId,
    })
    if (!generated) { sendError(res, 503, 'AI_UNAVAILABLE', 'SEO generation failed'); return }

    const seo = await (prisma as any).postSeoMetadata.upsert({
      where: { postId },
      update: {
        metaTitle: generated.meta_title,
        metaDescription: generated.meta_description,
        ogTitle: generated.og_tags['og:title'],
        ogDescription: generated.og_tags['og:description'],
        ogType: generated.og_tags['og:type'],
        ogImageUrl: generated.og_tags['og:image'],
        keywords: generated.keywords,
      },
      create: {
        postId,
        workspaceId,
        metaTitle: generated.meta_title,
        metaDescription: generated.meta_description,
        ogTitle: generated.og_tags['og:title'],
        ogDescription: generated.og_tags['og:description'],
        ogType: generated.og_tags['og:type'],
        ogImageUrl: generated.og_tags['og:image'],
        keywords: generated.keywords,
      },
    })
    res.status(201).json({ seo })
  } catch (err) {
    logger.error({ err }, '[seo] generate failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate SEO metadata')
  }
})

// PATCH /api/v1/seo/:postId — manual update (user edits suggestions)
router.patch('/:postId', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId, metaTitle, metaDescription, ogTitle, ogDescription, ogType, ogImageUrl, keywords } =
    req.body as {
      workspaceId?: string
      metaTitle?: string
      metaDescription?: string
      ogTitle?: string
      ogDescription?: string
      ogType?: string
      ogImageUrl?: string
      keywords?: string[]
    }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkSeoAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const existing = await (prisma as any).postSeoMetadata.findFirst({ where: { postId, workspaceId } })
    if (!existing) { sendError(res, 404, 'NOT_FOUND', 'SEO metadata not found'); return }
    const seo = await (prisma as any).postSeoMetadata.update({
      where: { postId },
      data: {
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDescription !== undefined && { metaDescription }),
        ...(ogTitle !== undefined && { ogTitle }),
        ...(ogDescription !== undefined && { ogDescription }),
        ...(ogType !== undefined && { ogType }),
        ...(ogImageUrl !== undefined && { ogImageUrl }),
        ...(keywords !== undefined && { keywords }),
      },
    })
    res.json({ seo })
  } catch (err) {
    logger.error({ err }, '[seo] PATCH failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update SEO metadata')
  }
})

// DELETE /api/v1/seo/:postId
router.delete('/:postId', async (req: Request, res: Response): Promise<void> => {
  const { postId } = req.params
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkSeoAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const existing = await (prisma as any).postSeoMetadata.findFirst({ where: { postId, workspaceId } })
    if (!existing) { sendError(res, 404, 'NOT_FOUND', 'SEO metadata not found'); return }
    await (prisma as any).postSeoMetadata.delete({ where: { postId } })
    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, '[seo] DELETE failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete SEO metadata')
  }
})

export default router
