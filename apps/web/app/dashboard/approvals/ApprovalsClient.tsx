'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Post {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string
  submittedBy: string | null
  reviewNote: string | null
  status: string
  mediaUrls?: string[]
}

interface Comment {
  id: string
  author: string
  text: string
  createdAt: string
}

interface PostDetail extends Post {
  comments: Comment[]
}

interface MagicLink {
  id: string
  email: string
  expiresAt: string
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
  LINKEDIN:  'bg-sky-100 text-sky-700',
}

type Tab = 'pending' | 'all'

export function ApprovalsClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [tab, setTab] = useState<Tab>('pending')

  const [posts, setPosts] = useState<Post[]>([])
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Thread dialog
  const [threadPostId, setThreadPostId] = useState<string | null>(null)
  const [threadDetail, setThreadDetail] = useState<PostDetail | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [threadRejectNote, setThreadRejectNote] = useState('')
  const [threadRejectMode, setThreadRejectMode] = useState(false)
  const [threadActionLoading, setThreadActionLoading] = useState(false)

  // Magic links
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicLinks, setMagicLinks] = useState<MagicLink[]>([])
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicError, setMagicError] = useState<string | null>(null)
  const [magicGenerating, setMagicGenerating] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchPending = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load review queue')
        return
      }
      const data = (await res.json()) as { posts?: Post[]; pending?: Post[]; all?: Post[] }
      const pending = data.pending ?? data.posts ?? []
      const all = data.all ?? data.posts ?? []
      setPosts(pending)
      setAllPosts(all)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token, apiUrl])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function handleApprove(postId: string) {
    setActionLoading(postId)
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals/${postId}/approve`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to approve post')
        return
      }
      showToast('Post approved!')
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(postId: string, note: string) {
    setActionLoading(postId)
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals/${postId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: note }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to reject post')
        return
      }
      showToast('Post rejected.')
      setRejectingId(null)
      setRejectNote('')
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  async function openThread(postId: string) {
    setThreadPostId(postId)
    setThreadDetail(null)
    setThreadLoading(true)
    setThreadError(null)
    setThreadRejectMode(false)
    setThreadRejectNote('')
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals/${postId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setThreadError(body.error ?? 'Failed to load post detail')
        return
      }
      const data = (await res.json()) as { post?: PostDetail } & PostDetail
      setThreadDetail(data.post ?? data)
    } catch {
      setThreadError('Network error — please try again')
    } finally {
      setThreadLoading(false)
    }
  }

  async function handleThreadApprove() {
    if (!threadPostId) return
    setThreadActionLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals/${threadPostId}/approve`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to approve')
        return
      }
      showToast('Post approved!')
      setThreadPostId(null)
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setThreadActionLoading(false)
    }
  }

  async function handleThreadReject() {
    if (!threadPostId || !threadRejectNote.trim()) return
    setThreadActionLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/approvals/${threadPostId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: threadRejectNote }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to reject')
        return
      }
      showToast('Post rejected.')
      setThreadPostId(null)
      fetchPending()
    } catch {
      showToast('Network error — please try again')
    } finally {
      setThreadActionLoading(false)
    }
  }

  // Magic links
  const fetchMagicLinks = useCallback(async () => {
    setMagicLoading(true)
    setMagicError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/magic-links`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setMagicError(body.error ?? 'Failed to load links')
        return
      }
      const data = (await res.json()) as { links?: MagicLink[] } | MagicLink[]
      const links = Array.isArray(data) ? data : (data.links ?? [])
      setMagicLinks(links)
    } catch {
      setMagicError('Network error')
    } finally {
      setMagicLoading(false)
    }
  }, [apiUrl, token])

  useEffect(() => {
    if (magicOpen) fetchMagicLinks()
  }, [magicOpen, fetchMagicLinks])

  async function generateMagicLink() {
    if (!magicEmail.trim()) return
    setMagicGenerating(true)
    setMagicError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/magic-links`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: magicEmail }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setMagicError(body.error ?? 'Failed to generate link')
        return
      }
      setMagicEmail('')
      fetchMagicLinks()
      showToast('Magic link generated!')
    } catch {
      setMagicError('Network error')
    } finally {
      setMagicGenerating(false)
    }
  }

  async function revokeMagicLink(id: string) {
    try {
      await fetch(`${apiUrl}/api/v1/magic-links/${id}/revoke`, { method: 'DELETE', headers })
      fetchMagicLinks()
      showToast('Link revoked')
    } catch {
      showToast('Failed to revoke link')
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

  const displayPosts = tab === 'pending' ? posts : allPosts

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['pending', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'pending' ? 'Pending Review' : 'All Approvals'}
            {t === 'pending' && posts.length > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {posts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchPending}>Retry</Button>
        </div>
      )}

      {!loading && !error && displayPosts.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <p className="font-semibold">All clear</p>
          <p className="text-sm text-muted-foreground">
            {tab === 'pending' ? 'No posts are waiting for your review.' : 'No approval records found.'}
          </p>
        </div>
      )}

      {!loading && !error && displayPosts.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {displayPosts.length} post{displayPosts.length !== 1 ? 's' : ''}
            {tab === 'pending' ? ' waiting for review' : ' total'}
          </p>
          {displayPosts.map((post) => (
            <div key={post.id} className="rounded-lg border bg-background overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {post.platforms.map((p) => (
                      <span key={p} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                        {p}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 ml-auto flex-wrap">
                    {post.submittedBy && (
                      <span className="text-xs text-muted-foreground">by {post.submittedBy}</span>
                    )}
                    {post.scheduledFor && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(post.scheduledFor), 'MMM d, yyyy · h:mm a')}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm whitespace-pre-wrap leading-relaxed line-clamp-3">{post.content}</p>

                {/* Reject form */}
                {rejectingId === post.id ? (
                  <div className="space-y-2 pt-1 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Rejection reason (required)</p>
                    <Textarea
                      placeholder="Explain the reason for rejection…"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleReject(post.id, rejectNote)} disabled={actionLoading === post.id || !rejectNote.trim()}>
                        {actionLoading === post.id ? 'Rejecting…' : '❌ Reject'}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRejectingId(null); setRejectNote('') }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1 border-t flex-wrap">
                    <Button size="sm" className="h-8 text-xs" onClick={() => handleApprove(post.id)} disabled={actionLoading === post.id}>
                      {actionLoading === post.id ? 'Approving…' : '✅ Approve'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => setRejectingId(post.id)} disabled={actionLoading === post.id}>
                      ❌ Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => openThread(post.id)}>
                      💬 View Thread
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Magic Links section */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <button
          onClick={() => setMagicOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
        >
          <span>🔗 Magic Links (Owner)</span>
          <span className="text-muted-foreground">{magicOpen ? '▾' : '▸'}</span>
        </button>
        {magicOpen && (
          <div className="px-4 pb-4 border-t space-y-4 pt-3">
            <div className="flex gap-2">
              <Input
                placeholder="reviewer@example.com"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') generateMagicLink() }}
                className="flex-1"
              />
              <Button size="sm" onClick={generateMagicLink} disabled={magicGenerating || !magicEmail.trim()}>
                {magicGenerating ? 'Generating…' : 'Generate Link'}
              </Button>
            </div>
            {magicError && <p className="text-sm text-destructive">{magicError}</p>}
            {magicLoading && <div className="h-12 bg-muted rounded animate-pulse" />}
            {!magicLoading && magicLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">No active magic links.</p>
            )}
            {!magicLoading && magicLinks.length > 0 && (
              <div className="space-y-2">
                {magicLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{link.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires {format(new Date(link.expiresAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => revokeMagicLink(link.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thread Dialog */}
      <Dialog open={!!threadPostId} onOpenChange={(o) => { if (!o) setThreadPostId(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Post Thread</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {threadLoading && (
              <div className="space-y-3">
                <div className="h-24 bg-muted rounded animate-pulse" />
                <div className="h-16 bg-muted rounded animate-pulse" />
              </div>
            )}
            {threadError && <p className="text-sm text-destructive">{threadError}</p>}
            {threadDetail && (
              <>
                {/* Platforms */}
                <div className="flex flex-wrap gap-1">
                  {threadDetail.platforms.map((p) => (
                    <span key={p} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                      {p}
                    </span>
                  ))}
                </div>

                {/* Content */}
                <div className="rounded border bg-muted/50 p-3">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{threadDetail.content}</p>
                </div>

                {/* Media */}
                {threadDetail.mediaUrls && threadDetail.mediaUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {threadDetail.mediaUrls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" className="h-20 w-20 object-cover rounded border" />
                    ))}
                  </div>
                )}

                {/* Comments */}
                {threadDetail.comments && threadDetail.comments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comments</p>
                    {threadDetail.comments.map((c) => (
                      <div key={c.id} className="rounded border bg-background px-3 py-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{c.author}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(c.createdAt), 'MMM d · h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Approve/Reject */}
                {threadRejectMode ? (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground">Rejection reason (required)</p>
                    <Textarea
                      placeholder="Explain the reason for rejection…"
                      value={threadRejectNote}
                      onChange={(e) => setThreadRejectNote(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={handleThreadReject}
                        disabled={threadActionLoading || !threadRejectNote.trim()}
                      >
                        {threadActionLoading ? 'Rejecting…' : '❌ Confirm Reject'}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setThreadRejectMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 border-t pt-4">
                    <Button size="sm" onClick={handleThreadApprove} disabled={threadActionLoading}>
                      {threadActionLoading ? 'Approving…' : '✅ Approve'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setThreadRejectMode(true)}>
                      ❌ Reject
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
