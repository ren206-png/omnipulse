import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { getSeoDataProvider } from '../services/seo/seoDataGateway.js'

const router = Router()
router.use(requireAuth)

async function checkAccess(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ])
  return !!(ws && (ws.ownerId === userId || member))
}

// POST /api/v1/seo-data/keyword-volume
// Body: { workspaceId, keywords: string[] }
router.post('/keyword-volume', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, keywords } = req.body as { workspaceId?: string; keywords?: string[] }
  if (!workspaceId || !Array.isArray(keywords) || keywords.length === 0) {
    sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and keywords[] required')
    return
  }
  if (!await checkAccess(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied')
    return
  }
  try {
    const provider = getSeoDataProvider()
    const results = await provider.getKeywordVolume(keywords.slice(0, 10))
    res.json({ results: results ?? [] })
  } catch (err) {
    logger.error({ err }, '[seoData] keyword-volume failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch keyword volume')
  }
})

// POST /api/v1/seo-data/serp-snapshot
// Body: { workspaceId, query: string }
router.post('/serp-snapshot', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, query } = req.body as { workspaceId?: string; query?: string }
  if (!workspaceId || !query?.trim()) {
    sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and query required')
    return
  }
  if (!await checkAccess(workspaceId, req.user!.id)) {
    sendError(res, 403, 'FORBIDDEN', 'Access denied')
    return
  }
  try {
    const provider = getSeoDataProvider()
    const snapshot = await provider.getSerpSnapshot(query.trim())
    res.json({ snapshot: snapshot ?? null })
  } catch (err) {
    logger.error({ err }, '[seoData] serp-snapshot failed')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch SERP snapshot')
  }
})

export default router
