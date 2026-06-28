import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { randomBytes, createHash } from 'crypto'

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

// GET /api/v1/api-keys?workspaceId=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as Record<string, string>
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  const workspace = await checkWorkspaceAccess(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  const keys = await prisma.apiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true, revokedAt: true },
  })
  res.json({ keys })
})

// POST /api/v1/api-keys
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, name } = req.body as { workspaceId?: string; name?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_WORKSPACE', 'workspaceId required'); return }
  if (!name) { sendError(res, 400, 'MISSING_NAME', 'name required'); return }
  const workspace = await checkWorkspaceAccess(workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  const raw = `op_live_${randomBytes(16).toString('hex')}`
  const keyHash = createHash('sha256').update(raw).digest('hex')
  const keyPrefix = raw.slice(0, 12)

  const apiKey = await prisma.apiKey.create({
    data: { workspaceId, name, keyHash, keyPrefix },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, revokedAt: true, lastUsedAt: true },
  })

  res.status(201).json({ ...apiKey, key: raw })
})

// DELETE /api/v1/api-keys/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const existing = await prisma.apiKey.findUnique({ where: { id } })
  if (!existing) { sendError(res, 404, 'NOT_FOUND', 'API key not found'); return }
  const workspace = await checkWorkspaceAccess(existing.workspaceId, req.user!.id)
  if (!workspace) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
  res.json({ success: true })
})

export default router
