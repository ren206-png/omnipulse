'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface MediaAsset {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  createdAt: string
}

interface Props {
  token: string
  workspaceId: string
  onSelect: (url: string) => void
  onClose: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaLibraryModal({ token, workspaceId, onSelect, onClose }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const loadAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/media?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { assets: MediaAsset[] }
      setAssets(data.assets ?? [])
    } catch {
      setError('Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, token, workspaceId])

  useEffect(() => { loadAssets() }, [loadAssets])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('workspaceId', workspaceId)
      try {
        await fetch(`${apiUrl}/api/v1/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      } catch {
        setError(`Failed to upload ${file.name}`)
      }
    }
    setUploading(false)
    loadAssets()
  }

  async function handleDelete(id: string) {
    await fetch(`${apiUrl}/api/v1/media/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Media Library</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {uploading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                '↑'
              )}{' '}
              Upload
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-accent transition-colors text-muted-foreground"
            >
              ✕
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        {/* Drop zone hint */}
        <div
          className="mx-5 mt-4 mb-2 border-2 border-dashed rounded-lg p-3 text-center text-xs text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors shrink-0"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files) }}
        >
          Drag &amp; drop images here, or click to browse (max 10 MB each)
        </div>

        {error && (
          <p className="mx-5 text-xs text-destructive">{error}</p>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No media yet. Upload some images to get started.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border bg-muted cursor-pointer hover:border-primary transition-colors"
                  onClick={() => onSelect(asset.url)}
                >
                  {asset.mimeType.startsWith('video/') ? (
                    <video
                      src={asset.url}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.url}
                      alt={asset.originalName}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex flex-col justify-between p-1.5 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id) }}
                      className="self-end rounded bg-destructive/90 px-1.5 py-0.5 text-xs text-white"
                    >
                      ✕
                    </button>
                    <p className="text-xs text-white bg-black/50 rounded px-1 truncate">
                      {formatBytes(asset.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
