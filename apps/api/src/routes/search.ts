import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

// GET /api/v1/search?workspaceId=&q=&types=posts,templates,media&limit=20
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, q, types = 'posts,templates,media', limit = '20' } = req.query as Record<string, string>
  if (!workspaceId || !q?.trim()) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and q required'); return }

  // Verify caller belongs to this workspace
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
  })
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!member && workspace?.ownerId !== req.user!.id) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied'); return
  }

  const query = q.trim()
  const typeList = types.split(',').map(t => t.trim())
  const lim = Math.min(parseInt(limit, 10) || 20, 50)
  const results: { type: string; id: string; title: string; subtitle: string; href: string; icon: string }[] = []

  try {
    // Search posts (content contains query, case-insensitive)
    if (typeList.includes('posts')) {
      const posts = await prisma.scheduledPost.findMany({
        where: { workspaceId, content: { contains: query, mode: 'insensitive' } },
        select: { id: true, content: true, platforms: true, status: true, scheduledFor: true },
        take: lim,
        orderBy: { scheduledFor: 'desc' },
      })
      for (const p of posts) {
        results.push({
          type: 'post',
          id: p.id,
          title: p.content.slice(0, 80) + (p.content.length > 80 ? '…' : ''),
          subtitle: `${p.platforms.join(', ')} • ${p.status} • ${new Date(p.scheduledFor).toLocaleDateString()}`,
          href: p.status === 'PUBLISHED' ? `/dashboard/posts/${p.id}` : `/dashboard/calendar?postId=${p.id}`,
          icon: '📝',
        })
      }
    }

    // Search templates
    if (typeList.includes('templates')) {
      const templates = await prisma.contentTemplate.findMany({
        where: { workspaceId, OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ]},
        select: { id: true, name: true, content: true, platforms: true },
        take: lim,
      })
      for (const t of templates) {
        results.push({
          type: 'template',
          id: t.id,
          title: t.name,
          subtitle: t.content.slice(0, 60) + (t.content.length > 60 ? '…' : ''),
          href: `/dashboard/templates`,
          icon: '📋',
        })
      }
    }

    // Search media assets
    if (typeList.includes('media')) {
      const media = await (prisma as any).mediaAsset.findMany({
        where: { workspaceId, OR: [
          { filename: { contains: query, mode: 'insensitive' } },
          { tags: { has: query.toLowerCase() } },
        ]},
        select: { id: true, filename: true, url: true, mimeType: true, tags: true },
        take: lim,
      })
      for (const m of media) {
        results.push({
          type: 'media',
          id: m.id,
          title: m.filename,
          subtitle: `${m.mimeType} • ${m.tags?.join(', ') || 'no tags'}`,
          href: `/dashboard/media`,
          icon: '🖼️',
        })
      }
    }

    res.json({ results, query, total: results.length })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Search failed')
  }
})

export default router
