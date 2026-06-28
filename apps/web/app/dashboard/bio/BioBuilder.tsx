'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface BioLink {
  id: string
  title: string
  url: string
  icon: string | null
  clicks: number
  active: boolean
  position: number
}

interface BioPage {
  id: string
  slug: string
  title: string
  bio: string | null
  avatarUrl: string | null
  theme: string
  views: number
  links: BioLink[]
}

const THEMES = [
  { value: 'light', label: 'Light', bg: 'bg-gradient-to-br from-gray-100 to-gray-200', preview: 'bg-white' },
  { value: 'dark', label: 'Dark', bg: 'bg-gradient-to-br from-slate-900 to-slate-800', preview: 'bg-slate-800' },
  { value: 'gradient', label: 'Gradient', bg: 'bg-gradient-to-br from-purple-600 to-blue-500', preview: 'bg-gradient-to-br from-purple-500 to-blue-400' },
]

// ─── Preview Component ────────────────────────────────────────────────────────

function BioPreview({ slug, title, bio, avatarUrl, theme, links }: {
  slug: string
  title: string
  bio: string
  avatarUrl: string
  theme: string
  links: BioLink[]
}) {
  const themes: Record<string, { bg: string; card: string; text: string; sub: string; btn: string; btnText: string }> = {
    light: { bg: 'bg-gradient-to-br from-gray-100 to-gray-200', card: 'bg-white', text: 'text-gray-900', sub: 'text-gray-500', btn: 'bg-gray-900', btnText: 'text-white' },
    dark: { bg: 'bg-gradient-to-br from-slate-900 to-slate-800', card: 'bg-slate-800', text: 'text-white', sub: 'text-slate-400', btn: 'bg-white', btnText: 'text-gray-900' },
    gradient: { bg: 'bg-gradient-to-br from-purple-600 to-blue-500', card: 'bg-white/10', text: 'text-white', sub: 'text-white/70', btn: 'bg-white/20 border border-white/30', btnText: 'text-white' },
  }
  const themeConfig = themes[theme] ?? themes.light

  const activeLinks = links.filter((l) => l.active)

  return (
    <div className={`h-full w-full ${themeConfig.bg} flex flex-col items-center justify-center px-4 py-8 overflow-auto`}>
      <div className={`w-full max-w-xs ${themeConfig.card} rounded-2xl shadow-xl p-6 flex flex-col items-center gap-4`}>
        {/* Avatar */}
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={title} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${themeConfig.btn} ${themeConfig.btnText}`}>
            {title ? title.charAt(0).toUpperCase() : '?'}
          </div>
        )}
        {/* Title */}
        <div className="text-center">
          <p className={`font-bold text-base ${themeConfig.text}`}>{title || 'Your Name'}</p>
          {bio && <p className={`text-xs mt-1 ${themeConfig.sub}`}>{bio}</p>}
        </div>
        {/* Links */}
        <div className="w-full flex flex-col gap-2">
          {activeLinks.length === 0 && (
            <p className={`text-center text-xs ${themeConfig.sub}`}>No links yet</p>
          )}
          {activeLinks.map((link) => (
            <div key={link.id} className={`w-full py-2 px-3 rounded-full text-xs font-medium text-center ${themeConfig.btn} ${themeConfig.btnText}`}>
              {link.icon && <span className="mr-1">{link.icon}</span>}
              {link.title}
            </div>
          ))}
        </div>
        {slug && (
          <p className="text-xs text-gray-400 mt-1">/{slug}</p>
        )}
      </div>
      <p className="mt-4 text-xs text-white/40">Powered by OmniPulse</p>
    </div>
  )
}

// ─── Main BioBuilder ──────────────────────────────────────────────────────────

export function BioBuilder({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const [page, setPage] = useState<BioPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Form state
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [theme, setTheme] = useState('light')
  const [links, setLinks] = useState<BioLink[]>([])

  // Add-link form
  const [addingLink, setAddingLink] = useState(false)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkIcon, setNewLinkIcon] = useState('')
  const [addingLinkLoading, setAddingLinkLoading] = useState(false)

  const fetchPage = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/bio?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json() as { page: BioPage | null }
      if (data.page) {
        setPage(data.page)
        setSlug(data.page.slug)
        setTitle(data.page.title)
        setBio(data.page.bio ?? '')
        setAvatarUrl(data.page.avatarUrl ?? '')
        setTheme(data.page.theme)
        setLinks(data.page.links)
      }
    } catch {
      setError('Failed to load bio page')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, apiUrl, token])

  useEffect(() => { fetchPage() }, [fetchPage])

  async function handleSave() {
    if (!activeWorkspace) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const method = page ? 'PUT' : 'POST'
      const url = page ? `${apiUrl}/api/v1/bio/${page.id}` : `${apiUrl}/api/v1/bio`
      const body = page
        ? { slug, title, bio, avatarUrl, theme }
        : { workspaceId: activeWorkspace.id, slug, title, bio, avatarUrl, theme }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { page?: BioPage; message?: string; error?: string }
      if (!res.ok) { setError(data.error ?? data.message ?? 'Failed to save'); return }
      setPage(data.page!)
      setLinks(data.page!.links)
      setSuccess('Saved!')
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLink() {
    if (!page) return
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return
    setAddingLinkLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/bio/${page.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newLinkTitle, url: newLinkUrl, icon: newLinkIcon || undefined }),
      })
      const data = await res.json() as { link?: BioLink; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to add link'); return }
      setLinks((prev) => [...prev, data.link!])
      setNewLinkTitle('')
      setNewLinkUrl('')
      setNewLinkIcon('')
      setAddingLink(false)
    } catch {
      setError('Network error')
    } finally {
      setAddingLinkLoading(false)
    }
  }

  async function handleToggleLink(linkId: string, active: boolean) {
    if (!page) return
    try {
      const res = await fetch(`${apiUrl}/api/v1/bio/${page.id}/links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) return
      setLinks((prev) => prev.map((l) => l.id === linkId ? { ...l, active } : l))
    } catch {}
  }

  async function handleDeleteLink(linkId: string) {
    if (!page) return
    try {
      await fetch(`${apiUrl}/api/v1/bio/${page.id}/links/${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setLinks((prev) => prev.filter((l) => l.id !== linkId))
    } catch {}
  }

  function handleCopyLink() {
    if (!slug) return
    navigator.clipboard.writeText(`${window.location.origin}/u/${slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!activeWorkspace) {
    return <p className="text-muted-foreground text-sm">Select a workspace to manage your bio page.</p>
  }

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading…</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── LEFT: Editor ── */}
      <div className="space-y-6">
        {/* Page Setup */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Page Setup</h2>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <div className="flex items-center gap-0">
              <span className="text-sm text-muted-foreground bg-muted border border-r-0 rounded-l-md px-3 h-9 flex items-center">/u/</span>
              <Input
                id="slug"
                placeholder="your-name"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="rounded-l-none"
              />
            </div>
            {slug && (
              <p className="text-xs text-muted-foreground">
                Live URL: <span className="text-foreground font-mono">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/u/{slug}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title / Name</Label>
            <Input id="title" placeholder="Jane Doe" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" placeholder="A short bio about yourself…" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="avatar">Avatar URL</Label>
            <Input id="avatar" placeholder="https://example.com/avatar.jpg" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all',
                    theme === t.value ? 'border-primary' : 'border-border hover:border-muted-foreground',
                  )}
                >
                  <div className={`w-10 h-7 rounded ${t.bg}`} />
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Links</h2>
            {!page && (
              <p className="text-xs text-muted-foreground">Save your page first to add links</p>
            )}
          </div>

          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-center gap-3 p-3 rounded-lg border bg-background">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{link.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                </div>
                {/* Active toggle */}
                <button
                  onClick={() => handleToggleLink(link.id, !link.active)}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
                    link.active ? 'bg-primary' : 'bg-muted',
                  )}
                  aria-label={link.active ? 'Deactivate' : 'Activate'}
                >
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow', link.active ? 'translate-x-4.5' : 'translate-x-0.5')} />
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDeleteLink(link.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 text-lg leading-none"
                  aria-label="Delete link"
                >
                  ×
                </button>
              </div>
            ))}
            {links.length === 0 && page && (
              <p className="text-sm text-muted-foreground text-center py-4">No links yet. Add your first one!</p>
            )}
          </div>

          {page && (
            addingLink ? (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <div className="space-y-1.5">
                  <Label>Link Title</Label>
                  <Input placeholder="Twitter" value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <Input placeholder="https://twitter.com/yourhandle" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Icon (emoji, optional)</Label>
                  <Input placeholder="🐦" value={newLinkIcon} onChange={(e) => setNewLinkIcon(e.target.value)} maxLength={2} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddLink} disabled={addingLinkLoading || !newLinkTitle.trim() || !newLinkUrl.trim()}>
                    {addingLinkLoading ? 'Adding…' : 'Add Link'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingLink(false); setNewLinkTitle(''); setNewLinkUrl(''); setNewLinkIcon('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAddingLink(true)}>
                + Add Link
              </Button>
            )
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <Button onClick={handleSave} disabled={saving || !slug || !title} className="w-full">
          {saving ? 'Saving…' : page ? 'Save Changes' : 'Publish Bio Page'}
        </Button>
      </div>

      {/* ── RIGHT: Preview ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Live Preview</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopyLink} disabled={!slug}>
              {copied ? '✓ Copied!' : '🔗 Copy Link'}
            </Button>
            {slug && (
              <a href={`/u/${slug}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  👁 View Live
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Phone frame */}
        <div className="flex justify-center">
          <div
            className="relative bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden"
            style={{ width: 375, height: 667 }}
          >
            {/* Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-gray-900 rounded-b-2xl z-10" />
            {/* Screen */}
            <div className="absolute inset-2 rounded-[2rem] overflow-hidden bg-white">
              <BioPreview
                slug={slug}
                title={title}
                bio={bio}
                avatarUrl={avatarUrl}
                theme={theme}
                links={links}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
