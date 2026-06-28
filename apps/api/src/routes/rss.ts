import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'

const router = Router()
router.use(requireAuth)

async function checkWorkspaceAccess(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return null
  if (workspace.ownerId === userId) return workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  return membership ? workspace : null
}

// Simple regex-based RSS parser
function parseRssItems(xml: string): Array<{ guid: string; title: string; description: string; link: string }> {
  const items: Array<{ guid: string; title: string; description: string; link: string }> = []
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
      return m ? m[1].trim() : ''
    }
    const guid = get('guid') || get('link')
    const title = get('title')
    const description = get('description')
    const link = get('link')
    if (guid) items.push({ guid, title, description, link })
  }
  return items
}

// GET /api/v1/rss?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as Record<string, string>
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  const workspace = await checkWorkspaceAccess(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  const feeds = await prisma.rssFeed.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ feeds })
})

// POST /api/v1/rss
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, url, name, platforms = [], checkInterval = 60 } = req.body as {
    workspaceId?: string
    url?: string
    name?: string
    platforms?: string[]
    checkInterval?: number
  }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  if (!url) { sendError(res, 400, 'MISSING_URL', 'url required'); return }
  if (!name) { sendError(res, 400, 'MISSING_NAME', 'name required'); return }
  const workspace = await checkWorkspaceAccess(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  try {
    const feed = await prisma.rssFeed.create({
      data: { workspaceId, url, name, platforms: platforms as any, checkInterval },
    })
    res.status(201).json({ feed })
  } catch (err: any) {
    if (err.code === 'P2002') {
      sendError(res, 409, 'DUPLICATE', 'A feed with this URL already exists in the workspace')
      return
    }
    throw err
  }
})

// PATCH /api/v1/rss/:id
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const existing = await prisma.rssFeed.findUnique({ where: { id } })
  if (!existing) { sendError(res, 404, 'NOT_FOUND', 'Feed not found'); return }
  const workspace = await checkWorkspaceAccess(existing.workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  const { active, name, platforms } = req.body as { active?: boolean; name?: string; platforms?: string[] }
  const feed = await prisma.rssFeed.update({
    where: { id },
    data: {
      ...(active !== undefined ? { active } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(platforms !== undefined ? { platforms: platforms as any } : {}),
    },
  })
  res.json({ feed })
})

// DELETE /api/v1/rss/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const existing = await prisma.rssFeed.findUnique({ where: { id } })
  if (!existing) { sendError(res, 404, 'NOT_FOUND', 'Feed not found'); return }
  const workspace = await checkWorkspaceAccess(existing.workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  await prisma.rssFeed.delete({ where: { id } })
  res.json({ success: true })
})

// POST /api/v1/rss/:id/check — manually trigger check
router.post('/:id/check', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const existing = await prisma.rssFeed.findUnique({ where: { id } })
  if (!existing) { sendError(res, 404, 'NOT_FOUND', 'Feed not found'); return }
  const workspace = await checkWorkspaceAccess(existing.workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  try {
    const response = await fetch(existing.url)
    if (!response.ok) {
      sendError(res, 502, 'FETCH_ERROR', `Failed to fetch RSS feed: ${response.status}`)
      return
    }
    const xml = await response.text()
    const items = parseRssItems(xml)

    let newPosts = 0
    const lastGuid = existing.lastItemGuid
    let latestGuid = lastGuid

    for (const item of items) {
      if (lastGuid && item.guid === lastGuid) break
      // Create a scheduled post draft for each new item
      const content = item.title
        ? `${item.title}\n\n${item.link || ''}`
        : item.description.slice(0, 500)

      await prisma.scheduledPost.create({
        data: {
          workspaceId: existing.workspaceId,
          content: content.trim(),
          mediaUrls: [],
          platforms: existing.platforms,
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          status: 'DRAFT',
        },
      })
      newPosts++
      if (newPosts === 1) latestGuid = item.guid
    }

    await prisma.rssFeed.update({
      where: { id },
      data: {
        lastCheckedAt: new Date(),
        ...(latestGuid !== lastGuid ? { lastItemGuid: latestGuid ?? undefined } : {}),
      },
    })

    res.json({ newPosts })
  } catch (err) {
    logger.error({ err }, 'RSS check error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to check RSS feed')
  }
})

export default router
