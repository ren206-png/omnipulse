import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { sendError } from '../lib/apiError.js'

const router = Router()

// ── Storage ───────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve('public/uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// In-memory store for media assets (per workspace, persisted in memory)
// In production you'd store this in the DB; for now a lightweight JSON file per workspace.
const STORE_FILE = path.join(UPLOAD_DIR, '_index.json')

interface MediaAsset {
  id: string
  workspaceId: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  createdAt: string
}

function readStore(): MediaAsset[] {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as MediaAsset[]
  } catch {
    return []
  }
}

function writeStore(assets: MediaAsset[]) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(assets, null, 2))
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']
    cb(null, allowed.includes(file.mimetype))
  },
})

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/v1/media?workspaceId=...
router.get('/', requireAuth, (req: Request, res: Response): void => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return }
  const assets = readStore().filter((a) => a.workspaceId === workspaceId)
  res.json({ assets })
})

// POST /api/v1/media
router.post(
  '/',
  requireAuth,
  upload.single('file'),
  (req: Request, res: Response): void => {
    const { workspaceId } = req.body as { workspaceId?: string }
    if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return }
    if (!req.file) { res.status(400).json({ error: 'file required' }); return }

    const asset: MediaAsset = {
      id: uuidv4(),
      workspaceId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `${env.API_URL}/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
    }

    const assets = readStore()
    assets.unshift(asset)
    writeStore(assets)

    res.status(201).json({ asset })
  },
)

// POST /api/v1/media/upload — alias for file upload (used by media library)
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  (req: Request, res: Response): void => {
    if (!req.file) { res.status(400).json({ error: 'file required' }); return }
    const url = `${env.API_URL}/uploads/${req.file.filename}`
    res.status(201).json({ url, filename: req.file.filename, mimeType: req.file.mimetype, size: req.file.size })
  },
)

// GET /api/v1/media/library?workspaceId=...&tag=...&search=...
router.get('/library', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, tag, search } = req.query as { workspaceId?: string; tag?: string; search?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  try {
    const assets = await (prisma as any).mediaAsset.findMany({
      where: {
        workspaceId,
        ...(tag ? { tags: { has: tag } } : {}),
        ...(search ? { filename: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({ assets })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch media library')
  }
})

// POST /api/v1/media/library — save asset metadata after upload
router.post('/library', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, url, filename, mimeType, size, tags } = req.body as {
    workspaceId?: string; url?: string; filename?: string; mimeType?: string; size?: number; tags?: string[]
  }
  if (!workspaceId || !url || !filename) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId, url, filename required'); return }
  try {
    const asset = await (prisma as any).mediaAsset.create({
      data: { workspaceId, url, filename, mimeType: mimeType ?? 'application/octet-stream', size: size ?? 0, tags: tags ?? [] },
    })
    res.status(201).json({ asset })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to save media asset')
  }
})

// PATCH /api/v1/media/library/:id — update tags
router.patch('/library/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { tags } = req.body as { tags?: string[] }
  try {
    const asset = await (prisma as any).mediaAsset.update({ where: { id }, data: { tags: tags ?? [] } })
    res.json({ asset })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update asset')
  }
})

// DELETE /api/v1/media/library/:id
router.delete('/library/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    await (prisma as any).mediaAsset.delete({ where: { id } })
    res.json({ success: true })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete asset')
  }
})

// DELETE /api/v1/media/:id
router.delete('/:id', requireAuth, (req: Request, res: Response): void => {
  const { id } = req.params
  const assets = readStore()
  const idx = assets.findIndex((a) => a.id === id)
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return }

  const [removed] = assets.splice(idx, 1)
  writeStore(assets)

  // Delete file from disk
  try { fs.unlinkSync(path.join(UPLOAD_DIR, removed.filename)) } catch { /* ignore */ }

  res.status(204).end()
})

export default router
