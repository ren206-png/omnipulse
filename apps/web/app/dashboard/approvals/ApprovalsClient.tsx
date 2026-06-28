'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

interface Post {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string
  submittedBy: string | null
  reviewNote: string | null
  status: string
}

interface Props {
  token: string
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:  'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK:    'bg-slate-100 text-slate-700',
  X:         'bg-gray-100 text-gray-700',
  GOOGLE:    'bg-orange-100 text-orange-700',
}

export function ApprovalsClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchPending = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/pending-review?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load review queue')
        return
      }
      const data = (await res.json()) as { posts: Post[] }
      setPosts(data.posts)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchPending() }, [fetchPending])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function handleApprove(postId: string) {
    setActionLoading(postId)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/approve`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to approve post')
        return
      }
      showToast('Post approved and scheduled!')
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(postId: string) {
    setActionLoading(postId)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: rejectNote }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to reject post')
        return
      }
      showToast('Post returned to draft.')
      setRejectingId(null)
      setRejectNote('')
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }


  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to view the review queue.</p>
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
        <span>{error}</span>
        <Button variant="ghost" size="sm" onClick={fetchPending}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {posts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <p className="font-semibold">All clear</p>
          <p className="text-sm text-muted-foreground">No posts are waiting for your review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? 's' : ''} waiting for review
          </p>
          {posts.map((post) => (
            <div key={post.id} className="rounded-lg border bg-background overflow-hidden">
              <div className="p-4 space-y-3">
                {/* Meta */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {post.platforms.map((p) => (
                      <span key={p} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                        {p}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Scheduled for {format(new Date(post.scheduledFor), 'MMM d, yyyy · h:mm a')}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>

                {/* Reject form */}
                {rejectingId === post.id ? (
                  <div className="space-y-2 pt-1 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Rejection note (optional)</p>
                    <Textarea
                      placeholder="Explain what needs to change…"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={() => handleReject(post.id)}
                        disabled={actionLoading === post.id}
                      >
                        {actionLoading === post.id ? 'Rejecting…' : 'Send Back'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setRejectingId(null); setRejectNote('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1 border-t">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleApprove(post.id)}
                      disabled={actionLoading === post.id}
                    >
                      {actionLoading === post.id ? 'Approving…' : '✓ Approve & Schedule'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => setRejectingId(post.id)}
                      disabled={actionLoading === post.id}
                    >
                      ✕ Send Back
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
