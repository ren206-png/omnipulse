'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

interface MediaAsset {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
  tags: string[]
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string) { return mimeType.startsWith('image/') }
function isVideo(mimeType: string) { return mimeType.startsWith('video/') }

export function MediaLibraryClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlFilename, setUrlFilename] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)
  const [showUrlForm, setShowUrlForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const fetchAssets = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ workspaceId: activeWorkspace.id })
      if (search) params.set('search', search)
      if (activeTag) params.set('tag', activeTag)
      const res = await fetch(`${apiUrl}/api/v1/media/library?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { assets?: MediaAsset[] }
      setAssets(data.assets ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [activeWorkspace?.id, token, search, activeTag, apiUrl])

  useEffect(() => { fetchAssets() }, [fetchAssets])

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length || !activeWorkspace?.id) return
    setUploading(true)
    setUploadError(null)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        // Use existing upload endpoint
        const uploadRes = await fetch(`${apiUrl}/api/v1/media/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        if (!uploadRes.ok) { setUploadError('Upload failed — check file size and type'); continue }
        const { url } = await uploadRes.json() as { url: string }
        // Save to library
        await fetch(`${apiUrl}/api/v1/media/library`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ workspaceId: activeWorkspace.id, url, filename: file.name, mimeType: file.type, size: file.size }),
        })
      }
      await fetchAssets()
    } catch { setUploadError('Upload failed — please try again') }
    finally { setUploading(false) }
  }

  async function handleAddUrl() {
    if (!urlInput.trim() || !activeWorkspace?.id) return
    setAddingUrl(true)
    try {
      const filename = urlFilename.trim() || urlInput.split('/').pop() || 'asset'
      const mimeType = /\.(mp4|mov|webm|avi)$/i.test(filename) ? 'video/mp4'
        : /\.(jpg|jpeg|png|gif|webp)$/i.test(filename) ? 'image/jpeg'
        : 'application/octet-stream'
      await fetch(`${apiUrl}/api/v1/media/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, url: urlInput.trim(), filename, mimeType }),
      })
      setUrlInput('')
      setUrlFilename('')
      setShowUrlForm(false)
      await fetchAssets()
    } catch {}
    finally { setAddingUrl(false) }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`${apiUrl}/api/v1/media/library/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch {}
    finally { setDeletingId(null) }
  }

  function copyUrl(asset: MediaAsset) {
    navigator.clipboard.writeText(asset.url).catch(() => {})
    setCopiedId(asset.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const allTags = [...new Set(assets.flatMap(a => a.tags))]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Media Library 🖼️</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload once, reuse across every post.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowUrlForm(v => !v)}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-accent transition-colors"
          >
            + Add URL
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? '⏳ Uploading…' : '⬆️ Upload Files'}
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden"
            onChange={e => handleFileUpload(e.target.files)} />
        </div>
      </div>

      {/* Add by URL form */}
      {showUrlForm && (
        <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
          <p className="text-sm font-medium">Add asset by URL</p>
          <input className="w-full h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-1 focus:ring-ring"
            placeholder="https://example.com/image.jpg"
            value={urlInput} onChange={e => setUrlInput(e.target.value)} />
          <input className="w-full h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-1 focus:ring-ring"
            placeholder="Filename (optional)"
            value={urlFilename} onChange={e => setUrlFilename(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={handleAddUrl} disabled={addingUrl || !urlInput.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {addingUrl ? 'Adding…' : 'Add to Library'}
            </button>
            <button onClick={() => setShowUrlForm(false)} className="px-3 py-2 text-sm border rounded-lg hover:bg-accent transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

      {/* Search + tag filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-1 focus:ring-ring w-full sm:w-64"
          placeholder="Search files…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setActiveTag(null)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${!activeTag ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
              All
            </button>
            {allTags.map(tag => (
              <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${activeTag === tag ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : assets.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-2xl p-16 text-center space-y-3 cursor-pointer hover:bg-accent/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <p className="text-5xl">🖼️</p>
          <p className="font-semibold">Your media library is empty</p>
          <p className="text-sm text-muted-foreground">Upload images and videos to reuse them across all your posts</p>
          <p className="text-xs text-primary">Click to upload files</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {assets.map(asset => (
            <div key={asset.id} className="group relative rounded-xl border overflow-hidden bg-muted/30 hover:shadow-md transition-all">
              {/* Preview */}
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {isImage(asset.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.url} alt={asset.filename} className="w-full h-full object-cover" />
                ) : isVideo(asset.mimeType) ? (
                  <video src={asset.url} className="w-full h-full object-cover" muted />
                ) : (
                  <span className="text-3xl">📎</span>
                )}
              </div>

              {/* Info */}
              <div className="p-2 space-y-1">
                <p className="text-xs font-medium truncate" title={asset.filename}>{asset.filename}</p>
                {asset.size > 0 && <p className="text-[10px] text-muted-foreground">{formatBytes(asset.size)}</p>}
              </div>

              {/* Actions overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                <button
                  onClick={() => copyUrl(asset)}
                  className="w-full px-3 py-1.5 text-xs bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
                >
                  {copiedId === asset.id ? '✓ Copied!' : '📋 Copy URL'}
                </button>
                <button
                  onClick={() => handleDelete(asset.id)}
                  disabled={deletingId === asset.id}
                  className="w-full px-3 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {deletingId === asset.id ? 'Deleting…' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assets.length > 0 && (
        <p className="text-xs text-muted-foreground">{assets.length} asset{assets.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}
