'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
  LINKEDIN: 'bg-sky-100 text-sky-700',
}

interface EvergreenPost {
  id: string
  content: string
  platforms: string[]
  lastRecycledAt: string | null
  nextRecycleAt: string | null
  minIntervalDays: number
  autoPublish: boolean
  seasonalExclusions: string[]
}

interface PublishedPost {
  id: string
  content: string
  platforms: string[]
}

export function EvergreenClient({ token }: { token: string }) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()

  const [posts, setPosts] = useState<EvergreenPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Settings per row
  const [editingId, setEditingId] = useState<string | null>(null)
  const [intervalInput, setIntervalInput] = useState<number>(30)
  const [autoPublishInput, setAutoPublishInput] = useState(false)
  const [exclusionsInput, setExclusionsInput] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  // Add to queue
  const [addOpen, setAddOpen] = useState(false)
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([])
  const [publishedLoading, setPublishedLoading] = useState(false)
  const [enqueueingId, setEnqueueingId] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchQueue = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/evergreen?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load queue')
        return
      }
      const data = (await res.json()) as { posts?: EvergreenPost[] } | EvergreenPost[]
      const list = Array.isArray(data) ? data : (data.posts ?? [])
      setPosts(list)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  async function handleDequeue(postId: string) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/evergreen/${postId}/dequeue`, { method: 'DELETE', headers })
      if (!res.ok) {
        showToast('Failed to remove from queue')
        return
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      showToast('Removed from evergreen queue')
    } catch {
      showToast('Network error — please try again')
    }
  }

  function openSettings(post: EvergreenPost) {
    setEditingId(post.id)
    setIntervalInput(post.minIntervalDays)
    setAutoPublishInput(post.autoPublish)
    setExclusionsInput(post.seasonalExclusions.join(', '))
  }

  async function saveSettings(postId: string) {
    setSavingSettings(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/evergreen/${postId}/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          minIntervalDays: intervalInput,
          autoPublish: autoPublishInput,
          seasonalExclusions: exclusionsInput.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) {
        showToast('Failed to save settings')
        return
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, minIntervalDays: intervalInput, autoPublish: autoPublishInput, seasonalExclusions: exclusionsInput.split(',').map((s) => s.trim()).filter(Boolean) }
            : p,
        ),
      )
      setEditingId(null)
      showToast('Settings saved')
    } catch {
      showToast('Network error — please try again')
    } finally {
      setSavingSettings(false)
    }
  }

  async function loadPublishedPosts() {
    if (!activeWorkspace) return
    setPublishedLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/history?workspaceId=${activeWorkspace.id}&status=PUBLISHED&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as { posts?: PublishedPost[] }
      setPublishedPosts(data.posts ?? [])
    } catch {
      // silently ignore
    } finally {
      setPublishedLoading(false)
    }
  }

  function openAddPanel() {
    setAddOpen(true)
    loadPublishedPosts()
  }

  async function handleEnqueue(postId: string) {
    setEnqueueingId(postId)
    try {
      const res = await fetch(`${apiUrl}/api/v1/evergreen/${postId}/enqueue`, { method: 'POST', headers })
      if (!res.ok) {
        showToast('Failed to add to queue')
        return
      }
      showToast('Added to evergreen queue')
      fetchQueue()
      setAddOpen(false)
    } catch {
      showToast('Network error — please try again')
    } finally {
      setEnqueueingId(null)
    }
  }

  const filteredPublished = publishedPosts.filter(
    (p) => !searchQ || p.content.toLowerCase().includes(searchQ.toLowerCase()),
  ).filter((p) => !posts.some((q) => q.id === p.id))

  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage your evergreen queue.</p>
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {posts.length} post{posts.length !== 1 ? 's' : ''} in queue
        </p>
        <Button size="sm" onClick={openAddPanel}>+ Add to Queue</Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchQueue}>Retry</Button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-3">
          <div className="text-4xl">♻️</div>
          <p className="font-semibold">No evergreen posts yet</p>
          <p className="text-sm text-muted-foreground">Add published posts to automatically recycle them.</p>
          <Button size="sm" onClick={openAddPanel}>+ Add to Queue</Button>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-lg border bg-card overflow-hidden">
              <div className="p-4 space-y-3">
                {/* Platforms + dates */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {post.platforms.map((p) => (
                      <span key={p} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                        {p}
                      </span>
                    ))}
                  </div>
                  <div className="ml-auto flex gap-4 text-xs text-muted-foreground flex-wrap">
                    {post.lastRecycledAt && (
                      <span>Last recycled: {format(new Date(post.lastRecycledAt), 'MMM d, yyyy')}</span>
                    )}
                    {post.nextRecycleAt && (
                      <span>Next: {format(new Date(post.nextRecycleAt), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm line-clamp-2 leading-relaxed">{post.content}</p>

                {/* Settings expanded */}
                {editingId === post.id ? (
                  <div className="border-t pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Min interval (days)</label>
                        <Input
                          type="number"
                          min={1}
                          value={intervalInput}
                          onChange={(e) => setIntervalInput(Number(e.target.value))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Seasonal exclusions</label>
                        <Input
                          placeholder="e.g. December, Summer"
                          value={exclusionsInput}
                          onChange={(e) => setExclusionsInput(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 mt-0.5 rounded border-border cursor-pointer"
                        checked={autoPublishInput}
                        onChange={(e) => setAutoPublishInput(e.target.checked)}
                      />
                      <div>
                        <span className="text-sm font-medium">Auto-publish</span>
                        {autoPublishInput && (
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                            ⚠️ Posts will be published automatically without review.
                          </p>
                        )}
                      </div>
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveSettings(post.id)} disabled={savingSettings}>
                        {savingSettings ? 'Saving…' : 'Save Settings'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 border-t pt-2 flex-wrap text-xs text-muted-foreground">
                    <span>Every {post.minIntervalDays}d</span>
                    {post.autoPublish && <span className="text-yellow-600">Auto-publish on</span>}
                    {post.seasonalExclusions.length > 0 && <span>Excl: {post.seasonalExclusions.join(', ')}</span>}
                    <div className="ml-auto flex gap-2">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-0.5"
                        onClick={() => openSettings(post)}
                      >
                        ⚙️ Settings
                      </button>
                      <button
                        className="text-xs text-destructive hover:text-destructive/80 border border-destructive/30 rounded px-2 py-0.5"
                        onClick={() => handleDequeue(post.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add to Queue panel */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h2 className="font-semibold text-base">Add Published Post to Queue</h2>
              <button type="button" onClick={() => setAddOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="p-4 border-b shrink-0">
              <Input
                placeholder="Search posts…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {publishedLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
                </div>
              )}
              {!publishedLoading && filteredPublished.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No published posts available.</p>
              )}
              {!publishedLoading && filteredPublished.map((post) => (
                <div key={post.id} className="rounded-lg border bg-background p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-1 mb-1">
                      {post.platforms.map((p) => (
                        <span key={p} className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm line-clamp-2 text-muted-foreground">{post.content}</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    disabled={enqueueingId === post.id}
                    onClick={() => handleEnqueue(post.id)}
                  >
                    {enqueueingId === post.id ? '…' : '+ Queue'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
