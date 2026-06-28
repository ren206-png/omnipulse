import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { env } from '../config/env.js'

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
      url: `${env.APP_URL.replace(':3000', ':4000')}/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
    }

    const assets = readStore()
    assets.unshift(asset)
    writeStore(assets)

    res.status(201).json({ asset })
  },
)

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
