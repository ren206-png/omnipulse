import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()

const SLUG_RE = /^[a-z0-9-]{3,30}$/

async function canAccessWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return false
  if (workspace.ownerId === userId) return true
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return !!membership
}

// ─── PUBLIC routes (no auth) ────────────────────────────────────────────────

// GET /api/v1/bio/public/:slug
router.get('/public/:slug', async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params
  try {
    const page = await prisma.bioPage.findUnique({
      where: { slug },
      include: {
        links: {
          where: { active: true },
          orderBy: { position: 'asc' },
        },
      },
    })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }

    // Increment views counter (fire-and-forget)
    prisma.bioPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } }).catch(() => {})

    res.json({ page })
  } catch (err) {
    logger.error({ err }, 'Get public bio page error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch bio page')
  }
})

// POST /api/v1/bio/public/:slug/click/:linkId
router.post('/public/:slug/click/:linkId', async (req: Request, res: Response): Promise<void> => {
  const { linkId } = req.params
  try {
    await prisma.bioLink.update({ where: { id: linkId }, data: { clicks: { increment: 1 } } })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Bio link click error')
    // Don't fail on click tracking errors
    res.json({ ok: false })
  }
})

// ─── Authenticated routes ────────────────────────────────────────────────────

router.use(requireAuth)

// GET /api/v1/bio?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!await canAccessWorkspace(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    const page = await prisma.bioPage.findUnique({
      where: { workspaceId },
      include: { links: { orderBy: { position: 'asc' } } },
    })
    res.json({ page: page ?? null })
  } catch (err) {
    logger.error({ err }, 'Get bio page error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch bio page')
  }
})

// POST /api/v1/bio — create/upsert bio page
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, slug, title, bio, avatarUrl, theme } = req.body as {
    workspaceId?: string
    slug?: string
    title?: string
    bio?: string
    avatarUrl?: string
    theme?: string
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!slug) { sendError(res, 400, 'MISSING_FIELD', 'slug is required'); return }
  if (!title || !title.trim()) { sendError(res, 400, 'MISSING_FIELD', 'title is required'); return }
  if (!SLUG_RE.test(slug)) {
    sendError(res, 400, 'INVALID_SLUG', 'slug must be 3-30 chars, lowercase alphanumeric + hyphens only')
    return
  }

  if (!await canAccessWorkspace(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    // Check slug uniqueness (excluding current workspace's page)
    const existing = await prisma.bioPage.findUnique({ where: { slug } })
    const currentPage = await prisma.bioPage.findUnique({ where: { workspaceId } })
    if (existing && existing.id !== currentPage?.id) {
      sendError(res, 409, 'SLUG_TAKEN', 'That slug is already taken'); return
    }

    const page = await prisma.bioPage.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        slug,
        title: title.trim(),
        bio: bio?.trim() ?? null,
        avatarUrl: avatarUrl?.trim() ?? null,
        theme: theme ?? 'light',
      },
      update: {
        slug,
        title: title.trim(),
        bio: bio?.trim() ?? null,
        avatarUrl: avatarUrl?.trim() ?? null,
        theme: theme ?? 'light',
      },
      include: { links: { orderBy: { position: 'asc' } } },
    })
    logger.info({ pageId: page.id }, 'Bio page upserted')
    res.status(201).json({ page })
  } catch (err) {
    logger.error({ err }, 'Create bio page error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create bio page')
  }
})

// PUT /api/v1/bio/:id — update bio page fields
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { slug, title, bio, avatarUrl, theme } = req.body as {
    slug?: string; title?: string; bio?: string; avatarUrl?: string; theme?: string
  }

  try {
    const page = await prisma.bioPage.findUnique({ where: { id } })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }
    if (!await canAccessWorkspace(page.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    if (slug !== undefined) {
      if (!SLUG_RE.test(slug)) {
        sendError(res, 400, 'INVALID_SLUG', 'slug must be 3-30 chars, lowercase alphanumeric + hyphens only')
        return
      }
      const existing = await prisma.bioPage.findUnique({ where: { slug } })
      if (existing && existing.id !== id) {
        sendError(res, 409, 'SLUG_TAKEN', 'That slug is already taken'); return
      }
    }

    const updated = await prisma.bioPage.update({
      where: { id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(title !== undefined && { title: title.trim() }),
        ...(bio !== undefined && { bio: bio.trim() || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl.trim() || null }),
        ...(theme !== undefined && { theme }),
      },
      include: { links: { orderBy: { position: 'asc' } } },
    })
    res.json({ page: updated })
  } catch (err) {
    logger.error({ err }, 'Update bio page error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update bio page')
  }
})

// POST /api/v1/bio/:id/links — add a link
router.post('/:id/links', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { title, url, icon } = req.body as { title?: string; url?: string; icon?: string }

  if (!title || !title.trim()) { sendError(res, 400, 'MISSING_FIELD', 'title is required'); return }
  if (!url || !url.trim()) { sendError(res, 400, 'MISSING_FIELD', 'url is required'); return }

  try {
    const page = await prisma.bioPage.findUnique({ where: { id } })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }
    if (!await canAccessWorkspace(page.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const count = await prisma.bioLink.count({ where: { bioPageId: id } })
    const link = await prisma.bioLink.create({
      data: {
        bioPageId: id,
        title: title.trim(),
        url: url.trim(),
        icon: icon?.trim() ?? null,
        position: count,
      },
    })
    res.status(201).json({ link })
  } catch (err) {
    logger.error({ err }, 'Add bio link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add link')
  }
})

// PATCH /api/v1/bio/:id/links/reorder — MUST come before /:id/links/:linkId
router.patch('/:id/links/reorder', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { orderedIds } = req.body as { orderedIds?: string[] }

  if (!Array.isArray(orderedIds)) { sendError(res, 400, 'MISSING_FIELD', 'orderedIds must be an array'); return }

  try {
    const page = await prisma.bioPage.findUnique({ where: { id } })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }
    if (!await canAccessWorkspace(page.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await prisma.$transaction(
      orderedIds.map((linkId, position) =>
        prisma.bioLink.update({ where: { id: linkId }, data: { position } })
      )
    )
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Reorder bio links error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reorder links')
  }
})

// PATCH /api/v1/bio/:id/links/:linkId — update a link
router.patch('/:id/links/:linkId', async (req: Request, res: Response): Promise<void> => {
  const { id, linkId } = req.params
  const { title, url, active, position } = req.body as {
    title?: string; url?: string; active?: boolean; position?: number
  }

  try {
    const page = await prisma.bioPage.findUnique({ where: { id } })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }
    if (!await canAccessWorkspace(page.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const link = await prisma.bioLink.update({
      where: { id: linkId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(url !== undefined && { url: url.trim() }),
        ...(active !== undefined && { active }),
        ...(position !== undefined && { position }),
      },
    })
    res.json({ link })
  } catch (err) {
    logger.error({ err }, 'Update bio link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update link')
  }
})

// DELETE /api/v1/bio/:id/links/:linkId — delete a link
router.delete('/:id/links/:linkId', async (req: Request, res: Response): Promise<void> => {
  const { id, linkId } = req.params

  try {
    const page = await prisma.bioPage.findUnique({ where: { id } })
    if (!page) { sendError(res, 404, 'NOT_FOUND', 'Bio page not found'); return }
    if (!await canAccessWorkspace(page.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    await prisma.bioLink.delete({ where: { id: linkId } })
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete bio link error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete link')
  }
})

export default router
