import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'

const router = Router()
router.use(requireAuth)

async function checkListeningAccess(workspaceId: string, userId: string): Promise<boolean> {
  const [ws, member] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ])
  return !!(ws && (ws.ownerId === userId || member))
}

// GET /api/v1/listening?workspaceId=...
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  if (!await checkListeningAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const keywords = await (prisma as any).listeningKeyword.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ keywords })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch keywords')
  }
})

// POST /api/v1/listening
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, keyword } = req.body as { workspaceId?: string; keyword?: string }
  if (!workspaceId || !keyword?.trim()) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and keyword required'); return }
  if (!await checkListeningAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const item = await (prisma as any).listeningKeyword.create({
      data: { workspaceId, keyword: keyword.trim() },
    })
    res.status(201).json({ keyword: item })
  } catch (err: any) {
    if (err?.code === 'P2002') { sendError(res, 409, 'CONFLICT', 'Keyword already exists for this workspace'); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add keyword')
  }
})

// DELETE /api/v1/listening/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const kw = await (prisma as any).listeningKeyword.findUnique({ where: { id }, select: { workspaceId: true } })
    if (!kw) { sendError(res, 404, 'NOT_FOUND', 'Keyword not found'); return }
    if (!await checkListeningAccess(kw.workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
    await (prisma as any).listeningKeyword.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete keyword')
  }
})

// GET /api/v1/listening/mentions?workspaceId=&keyword=
router.get('/mentions', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, keyword } = req.query as { workspaceId?: string; keyword?: string }
  if (!workspaceId || !keyword?.trim()) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId and keyword required'); return }
  if (!await checkListeningAccess(workspaceId, req.user!.id)) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
  try {
    const mentions = await prisma.inboxMessage.findMany({
      where: {
        workspaceId,
        content: { contains: keyword.trim(), mode: 'insensitive' },
      },
      select: {
        id: true,
        socialAccountId: true,
        platform: true,
        authorName: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ mentions })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch mentions')
  }
})

export default router
