'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Toast, ToastTitle, ToastDescription, ToastClose } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

interface QueuePost {
  id: string
  content: string
  platforms: string[]
  queuePosition: number
  status: string
  mediaUrls: string[]
}

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const

const PLATFORM_BADGE: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function QueueClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [posts, setPosts] = useState<QueuePost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [formContent, setFormContent] = useState('')
  const [formPlatforms, setFormPlatforms] = useState<string[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Toast
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const fetchQueue = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/queue?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { posts: QueuePost[] }
      setPosts(data.posts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  function showToast(msg: string) {
    setToastMessage(msg)
    setToastOpen(true)
  }

  async function handleAddToQueue() {
    if (!activeWorkspace) return
    if (!formContent.trim()) { setFormError('Content is required'); return }
    if (formPlatforms.length === 0) { setFormError('Select at least one platform'); return }
    setFormLoading(true)
    setFormError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, content: formContent, platforms: formPlatforms }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setFormError(body.error ?? 'Failed to add post')
        return
      }
      setFormContent('')
      setFormPlatforms([])
      setShowForm(false)
      fetchQueue()
      showToast('Post added to queue!')
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleReorder(newOrder: QueuePost[]) {
    if (!activeWorkspace) return
    setPosts(newOrder)
    try {
      await fetch(`${API_URL}/api/v1/queue/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, orderedIds: newOrder.map((p) => p.id) }),
      })
    } catch {
      showToast('Failed to save new order')
      fetchQueue()
    }
  }

  function moveUp(index: number) {
    if (index === 0) return
    const next = [...posts]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    handleReorder(next)
  }

  function moveDown(index: number) {
    if (index === posts.length - 1) return
    const next = [...posts]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    handleReorder(next)
  }

  async function handleDispatch(postId: string) {
    try {
      const res = await fetch(`${API_URL}/api/v1/queue/${postId}/dispatch`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to dispatch post')
        return
      }
      const data = (await res.json()) as { scheduledFor: string }
      const scheduled = new Date(data.scheduledFor)
      showToast(`Scheduled for ${scheduled.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`)
      fetchQueue()
    } catch {
      showToast('Network error — please try again')
    }
  }

  async function handleRemove(postId: string) {
    try {
      const res = await fetch(`${API_URL}/api/v1/queue/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))).error ?? 'Failed to remove post'
        showToast(body)
        return
      }
      fetchQueue()
      showToast('Post removed from queue.')
    } catch {
      showToast('Network error — please try again')
    }
  }

  function togglePlatform(p: string) {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
        Select a workspace to manage your queue.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add to Queue button */}
      <div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'outline' : 'default'}>
          {showForm ? 'Cancel' : '+ Add to Queue'}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-3 bg-card">
          <h3 className="font-medium text-sm">New Queue Post</h3>
          <Textarea
            placeholder="Write your post content…"
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            rows={3}
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    className="rounded"
                  />
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_BADGE[p])}>
                    {p}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <Button size="sm" onClick={handleAddToQueue} disabled={formLoading}>
            {formLoading ? 'Adding…' : 'Add to Queue'}
          </Button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchQueue}>Retry</Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-sm text-muted-foreground py-6 text-center">Loading queue…</div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            Your queue is empty. Add posts and we&apos;ll schedule them at the best times for each platform.
          </p>
        </div>
      )}

      {/* Queue list */}
      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post, index) => (
            <div key={post.id} className="rounded-lg border p-4 space-y-3 bg-card">
              <div className="flex items-start gap-3">
                {/* Position number */}
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Content preview */}
                  <p className="text-sm line-clamp-2">{post.content}</p>

                  {/* Platform badges */}
                  {post.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {post.platforms.map((pl) => (
                        <span
                          key={pl}
                          className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_BADGE[pl] ?? 'bg-muted text-muted-foreground')}
                        >
                          {pl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ▲ Up
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => moveDown(index)}
                      disabled={index === posts.length - 1}
                      title="Move down"
                    >
                      ▼ Down
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleDispatch(post.id)}
                      title="Dispatch at best time"
                    >
                      ⚡ Dispatch Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleRemove(post.id)}
                      title="Remove from queue"
                    >
                      ✕ Remove
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      <Toast open={toastOpen} onOpenChange={setToastOpen} duration={4000}>
        <div className="grid gap-1">
          <ToastTitle>Queue</ToastTitle>
          <ToastDescription>{toastMessage}</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </div>
  )
}
