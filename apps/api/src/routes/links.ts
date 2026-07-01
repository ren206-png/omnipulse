import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

async function checkLinkAccess(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ])
  return !!(ws && (ws.ownerId === userId || member))
}

// GET /api/v1/links?workspaceId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkLinkAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const links = await (prisma as any).shortLink.findMany({
      where: { workspaceId },
      orderBy: { clicks: 'desc' },
    })
    res.json({ links })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch links')
  }
})

// POST /api/v1/links
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, originalUrl, utmSource, utmMedium, utmCampaign } = req.body as {
    workspaceId?: string
    originalUrl?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
  }
  if (!workspaceId || !originalUrl?.trim()) {
    sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and originalUrl required')
    return
  }
  if (!await checkLinkAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  // Build final URL with UTM params baked in
  let finalUrl = originalUrl.trim()
  const utmParams: string[] = []
  if (utmSource?.trim()) utmParams.push(`utm_source=${encodeURIComponent(utmSource.trim())}`)
  if (utmMedium?.trim()) utmParams.push(`utm_medium=${encodeURIComponent(utmMedium.trim())}`)
  if (utmCampaign?.trim()) utmParams.push(`utm_campaign=${encodeURIComponent(utmCampaign.trim())}`)
  if (utmParams.length > 0) {
    const separator = finalUrl.includes('?') ? '&' : '?'
    finalUrl = finalUrl + separator + utmParams.join('&')
  }

  // Generate 6-char alphanumeric slug
  const slug = Math.random().toString(36).slice(2, 8)

  try {
    const link = await (prisma as any).shortLink.create({
      data: {
        workspaceId,
        originalUrl: finalUrl,
        slug,
        utmSource: utmSource?.trim() || null,
        utmMedium: utmMedium?.trim() || null,
        utmCampaign: utmCampaign?.trim() || null,
      },
    })
    res.status(201).json({
      id: link.id,
      slug: link.slug,
      shortUrl: `https://getomnipulse.com/l/${link.slug}`,
      originalUrl: link.originalUrl,
      clicks: link.clicks,
      createdAt: link.createdAt,
    })
  } catch (err: any) {
    if (err?.code === 'P2002') { sendError(res, 409, 'CONFLICT', 'Slug collision — please try again'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create link')
  }
})

// DELETE /api/v1/links/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const link = await (prisma as any).shortLink.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!link) { sendError(res, 404, 'NOT_FOUND', 'Link not found'); return }
    if (!await checkLinkAccess(link.workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await (prisma as any).shortLink.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete link')
  }
})

// POST /api/v1/links/:id/track — increment clicks
router.post('/:id/track', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const link = await (prisma as any).shortLink.update({
      where: { id },
      data: { clicks: { increment: 1 } },
    })
    res.json({ clicks: link.clicks })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to track click')
  }
})

export default router
