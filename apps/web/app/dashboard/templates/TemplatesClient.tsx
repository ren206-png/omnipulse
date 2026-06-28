'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const
type Platform = (typeof PLATFORMS)[number]

const PLATFORM_COLORS: Record<Platform, string> = {
  FACEBOOK:  'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK:    'bg-slate-100 text-slate-700',
  X:         'bg-gray-100 text-gray-700',
  GOOGLE:    'bg-orange-100 text-orange-700',
}

interface Template {
  id: string
  name: string
  content: string
  platforms: Platform[]
  category: string | null
  createdAt: string
}

interface Props { token: string }

const SUGGESTED_CATEGORIES = ['Announcement', 'Promotion', 'Engagement', 'Educational', 'Seasonal', 'Brand']

function TemplateForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<Template>
  onSave: (data: { name: string; content: string; platforms: Platform[]; category: string }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [platforms, setPlatforms] = useState<Platform[]>(initial?.platforms ?? [])
  const [category, setCategory] = useState(initial?.category ?? '')
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!content.trim()) { setError('Content is required'); return }
    setError(null)
    onSave({ name, content, platforms, category })
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
      <div className="space-y-1.5">
        <Label className="text-xs">Template name</Label>
        <Input
          placeholder="e.g. Product Launch Announcement"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <div className="flex gap-1.5 flex-wrap">
          {SUGGESTED_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? '' : c)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                category === c
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-muted-foreground',
              )}
            >
              {c}
            </button>
          ))}
          <Input
            placeholder="Custom…"
            value={SUGGESTED_CATEGORIES.includes(category) ? '' : category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-7 text-xs w-24 px-2"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Platforms <span className="text-muted-foreground font-normal">(optional — leave blank for all)</span></Label>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center gap-1.5">
              <Checkbox
                id={`tpl-plat-${p}`}
                checked={platforms.includes(p)}
                onCheckedChange={() => togglePlatform(p)}
              />
              <label htmlFor={`tpl-plat-${p}`} className="text-xs cursor-pointer">{p}</label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Content</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{content.length} chars</span>
        </div>
        <Textarea
          placeholder="Write your template content. Use [PLACEHOLDER] for parts that change each time."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="text-sm resize-y"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Template'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  )
}

export function TemplatesClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchTemplates = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/templates?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load templates')
      const data = (await res.json()) as { templates: Template[] }
      setTemplates(data.templates)
    } catch {
      setError('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate(data: { name: string; content: string; platforms: Platform[]; category: string }) {
    if (!activeWorkspace) return
    setSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/templates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId: activeWorkspace.id, ...data }),
      })
      if (!res.ok) { showToast('Failed to create template'); return }
      setShowCreate(false)
      showToast('Template created!')
      fetchTemplates()
    } finally { setSaving(false) }
  }

  async function handleUpdate(id: string, data: { name: string; content: string; platforms: Platform[]; category: string }) {
    setSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/templates/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      })
      if (!res.ok) { showToast('Failed to update template'); return }
      setEditingId(null)
      showToast('Template updated!')
      fetchTemplates()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await fetch(`${apiUrl}/api/v1/templates/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setConfirmDeleteId(null)
      showToast('Template deleted.')
      fetchTemplates()
    } finally { setDeletingId(null) }
  }

  function copyToClipboard(content: string) {
    navigator.clipboard.writeText(content).then(() => showToast('Copied to clipboard!'))
  }

  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[]

  const filtered = templates.filter((t) => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !filterCategory || t.category === filterCategory
    return matchesSearch && matchesCategory
  })

  // Group by category
  const grouped = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.category ?? 'Uncategorized'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})


  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) return <p className="text-sm text-muted-foreground">Select a workspace to manage templates.</p>

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm max-w-xs"
        />
        {categories.length > 0 && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <button
              onClick={() => setFilterCategory(null)}
              className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                !filterCategory ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-muted-foreground'
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCategory(filterCategory === c ? null : c)}
                className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                  filterCategory === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-muted-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <Button size="sm" className="ml-auto" onClick={() => { setShowCreate(true); setEditingId(null) }}>
          + New Template
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <TemplateForm
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          saving={saving}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          {error}
          <Button variant="ghost" size="sm" onClick={fetchTemplates}>Retry</Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && templates.length === 0 && !showCreate && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-3">
          <div className="text-3xl">📋</div>
          <p className="font-semibold">No templates yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Create reusable post templates to speed up your workflow. Use <span className="font-mono bg-muted px-1 rounded">[PLACEHOLDER]</span> for parts that change each time.
          </p>
          <Button onClick={() => setShowCreate(true)}>Create your first template</Button>
        </div>
      )}

      {/* Template groups */}
      {!loading && Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          {Object.keys(grouped).length > 1 && (
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{category}</h3>
          )}
          <div className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="rounded-lg border bg-background overflow-hidden">
                {editingId === t.id ? (
                  <div className="p-4">
                    <TemplateForm
                      initial={t}
                      onSave={(data) => handleUpdate(t.id, data)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{t.name}</p>
                          {t.category && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{t.category}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{t.content}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyToClipboard(t.content)}>
                          Copy
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingId(t.id); setShowCreate(false) }}>
                          Edit
                        </Button>
                        {confirmDeleteId === t.id ? (
                          <>
                            <Button size="sm" className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                              onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}>
                              {deletingId === t.id ? '…' : 'Confirm'}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDeleteId(null)}>✕</Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDeleteId(t.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    {t.platforms.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {t.platforms.map((p) => (
                          <span key={p} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p])}>
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
