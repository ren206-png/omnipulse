import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const

router.use(requireAuth)

async function canAccessWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return false
  if (workspace.ownerId === userId) return true
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return !!membership
}

// GET /api/v1/templates?workspaceId=&category=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, category } = req.query as { workspaceId?: string; category?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!await canAccessWorkspace(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  try {
    const templates = await prisma.contentTemplate.findMany({
      where: { workspaceId, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    res.json({ templates })
  } catch (err) {
    logger.error({ err }, 'List templates error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list templates')
  }
})

// POST /api/v1/templates
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, name, content, platforms, category } = req.body as {
    workspaceId?: string
    name?: string
    content?: string
    platforms?: string[]
    category?: string
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!name || !name.trim()) { sendError(res, 400, 'MISSING_FIELD', 'name is required'); return }
  if (!content || !content.trim()) { sendError(res, 400, 'MISSING_FIELD', 'content is required'); return }
  if (!await canAccessWorkspace(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  const badPlatforms = (platforms ?? []).filter(
    (p) => !VALID_PLATFORMS.includes(p as typeof VALID_PLATFORMS[number]),
  )
  if (badPlatforms.length > 0) {
    sendError(res, 400, 'INVALID_PLATFORM', `Invalid platforms: ${badPlatforms.join(', ')}`); return
  }

  try {
    const template = await prisma.contentTemplate.create({
      data: {
        workspaceId,
        name: name.trim(),
        content: content.trim(),
        platforms: (platforms ?? []) as (typeof VALID_PLATFORMS[number])[],
        category: category?.trim() || null,
        createdBy: req.user!.id,
      },
    })
    logger.info({ templateId: template.id }, 'Template created')
    res.status(201).json({ template })
  } catch (err) {
    logger.error({ err }, 'Create template error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create template')
  }
})

// PATCH /api/v1/templates/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { name, content, platforms, category } = req.body as {
    name?: string; content?: string; platforms?: string[]; category?: string
  }

  try {
    const template = await prisma.contentTemplate.findUnique({ where: { id } })
    if (!template) { sendError(res, 404, 'NOT_FOUND', 'Template not found'); return }
    if (!await canAccessWorkspace(template.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }

    const badPlatforms = (platforms ?? []).filter(
      (p) => !VALID_PLATFORMS.includes(p as typeof VALID_PLATFORMS[number]),
    )
    if (badPlatforms.length > 0) {
      sendError(res, 400, 'INVALID_PLATFORM', `Invalid platforms: ${badPlatforms.join(', ')}`); return
    }

    const updated = await prisma.contentTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(content !== undefined && { content: content.trim() }),
        ...(platforms !== undefined && { platforms: platforms as (typeof VALID_PLATFORMS[number])[] }),
        ...(category !== undefined && { category: category.trim() || null }),
      },
    })
    res.json({ template: updated })
  } catch (err) {
    logger.error({ err }, 'Update template error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update template')
  }
})

// DELETE /api/v1/templates/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const template = await prisma.contentTemplate.findUnique({ where: { id } })
    if (!template) { sendError(res, 404, 'NOT_FOUND', 'Template not found'); return }
    if (!await canAccessWorkspace(template.workspaceId, req.user!.id)) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
    }
    await prisma.contentTemplate.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete template error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete template')
  }
})

export default router
