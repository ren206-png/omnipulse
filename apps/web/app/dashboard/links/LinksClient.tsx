'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface ShortLink {
  id: string
  slug: string
  shortUrl: string
  originalUrl: string
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  clicks: number
  createdAt: string
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function truncate(str: string, max = 48): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function LinksClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()

  // Create form state
  const [originalUrl, setOriginalUrl] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [showUtm, setShowUtm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newLink, setNewLink] = useState<ShortLink | null>(null)
  const [successFlash, setSuccessFlash] = useState(false)
  const [copied, setCopied] = useState(false)

  // Links list state
  const [links, setLinks] = useState<ShortLink[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchLinks = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/links?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = (await res.json()) as { links: ShortLink[] }
      setLinks(data.links)
    } catch {
      setListError('Failed to load links')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  async function handleCreate() {
    if (!activeWorkspace) return
    if (!originalUrl.trim()) { setCreateError('URL is required'); return }
    setCreating(true)
    setCreateError(null)
    setNewLink(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          originalUrl: originalUrl.trim(),
          utmSource: utmSource.trim() || undefined,
          utmMedium: utmMedium.trim() || undefined,
          utmCampaign: utmCampaign.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        setCreateError(body.message ?? 'Failed to create link')
        return
      }
      const link = (await res.json()) as ShortLink
      setNewLink(link)
      setSuccessFlash(true)
      setTimeout(() => setSuccessFlash(false), 3000)
      setOriginalUrl('')
      setUtmSource('')
      setUtmMedium('')
      setUtmCampaign('')
      setShowUtm(false)
      // Prepend to list (already sorted by clicks desc on backend, but new link has 0 clicks)
      setLinks((prev) => [link, ...prev])
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  function copyToClipboard(text: string, id?: string) {
    navigator.clipboard.writeText(text).then(() => {
      if (id) {
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 1500)
      } else {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`${API_URL}/api/v1/links/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setLinks((prev) => prev.filter((l) => l.id !== id))
      if (newLink?.id === id) setNewLink(null)
    } catch {
      // silently fail
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Link Card */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-base">Shorten a URL</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Destination URL</label>
            <input
              type="url"
              placeholder="https://example.com/your-long-url"
              value={originalUrl}
              onChange={(e) => setOriginalUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Collapsible UTM section */}
          <button
            type="button"
            onClick={() => setShowUtm((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span>{showUtm ? '▾' : '▸'}</span>
            <span>Advanced UTM Parameters</span>
          </button>

          {showUtm && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-3 border-l-2 border-muted">
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">UTM Source</label>
                <input
                  type="text"
                  placeholder="e.g. twitter"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">UTM Medium</label>
                <input
                  type="text"
                  placeholder="e.g. social"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block text-muted-foreground">UTM Campaign</label>
                <input
                  type="text"
                  placeholder="e.g. summer-launch"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {createError && (
            <p className="text-xs text-destructive">{createError}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !activeWorkspace}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Shortening…' : '⚡ Shorten'}
          </button>
        </div>

        {/* Success result */}
        {newLink && (
          <div className={`rounded-lg border p-3 space-y-1 transition-colors ${successFlash ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'border-border'}`}>
            <p className="text-xs text-muted-foreground">Your short link is ready!</p>
            <div className="flex items-center gap-2">
              <a
                href={newLink.shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-primary hover:underline break-all"
              >
                {newLink.shortUrl}
              </a>
              <button
                onClick={() => copyToClipboard(newLink.shortUrl)}
                className="shrink-0 text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground break-all">{truncate(newLink.originalUrl, 80)}</p>
          </div>
        )}
      </div>

      {/* Links Table Card */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-base">Your Links</h2>

        {loading && (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded-md" />
            ))}
          </div>
        )}

        {listError && <p className="text-sm text-destructive">{listError}</p>}

        {!loading && !listError && links.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No links yet — shorten your first URL above
          </p>
        )}

        {!loading && links.length > 0 && (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Short URL</th>
                  <th className="text-left py-2 pr-3 font-medium">Original URL</th>
                  <th className="text-left py-2 pr-3 font-medium">UTM</th>
                  <th className="text-left py-2 pr-3 font-medium">Clicks</th>
                  <th className="text-left py-2 pr-3 font-medium">Created</th>
                  <th className="text-left py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {links.map((link) => {
                  const utmParts = [
                    link.utmSource && `src:${link.utmSource}`,
                    link.utmMedium && `med:${link.utmMedium}`,
                    link.utmCampaign && `cmp:${link.utmCampaign}`,
                  ].filter(Boolean)

                  return (
                    <tr key={link.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-3">
                        <a
                          href={link.shortUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono text-xs"
                        >
                          /l/{link.slug}
                        </a>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-xs text-muted-foreground" title={link.originalUrl}>
                          {truncate(link.originalUrl, 40)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        {utmParts.length > 0 ? (
                          <span className="text-xs text-muted-foreground">{utmParts.join(' · ')}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-bold">📊 {link.clicks.toLocaleString()}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-xs text-muted-foreground">{relativeTime(link.createdAt)}</span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copyToClipboard(link.shortUrl, link.id)}
                            className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
                            title="Copy short URL"
                          >
                            {copiedId === link.id ? '✓' : '📋'}
                          </button>
                          <button
                            onClick={() => handleDelete(link.id)}
                            disabled={deletingId === link.id}
                            className="text-xs px-2 py-1 rounded border hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50"
                            title="Delete link"
                          >
                            {deletingId === link.id ? '…' : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
