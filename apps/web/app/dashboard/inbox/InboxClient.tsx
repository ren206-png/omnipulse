'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

interface InboxMessage {
  id: string
  platform: string
  authorName: string
  authorHandle: string | null
  content: string
  type: 'COMMENT' | 'MENTION' | 'DM'
  status: 'UNREAD' | 'READ' | 'REPLIED' | 'DISMISSED'
  reply: string | null
  repliedAt: string | null
  createdAt: string
}

interface Props {
  token: string
}

const PLATFORM_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  FACEBOOK:  { bg: 'bg-blue-600',  text: 'text-white', label: 'F' },
  INSTAGRAM: { bg: 'bg-pink-500',  text: 'text-white', label: 'I' },
  TIKTOK:    { bg: 'bg-slate-900', text: 'text-white', label: 'T' },
  X:         { bg: 'bg-black',     text: 'text-white', label: 'X' },
  GOOGLE:    { bg: 'bg-red-600',   text: 'text-white', label: 'G' },
}

const TYPE_BADGE: Record<string, string> = {
  COMMENT: 'bg-blue-100 text-blue-700',
  MENTION: 'bg-purple-100 text-purple-700',
  DM:      'bg-green-100 text-green-700',
}

type FilterType = 'ALL' | 'COMMENT' | 'MENTION' | 'DM'

export function InboxClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<FilterType>('ALL')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [aiDraftLoading, setAiDraftLoading] = useState<string | null>(null)
  const [replyTone, setReplyTone] = useState<string>('friendly')
  const [seedLoading, setSeedLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchMessages = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ workspaceId: activeWorkspace.id, limit: '100' })
      if (unreadOnly) params.set('status', 'UNREAD')
      if (filterType !== 'ALL') params.set('type', filterType)
      const res = await fetch(`${apiUrl}/api/v1/inbox?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load inbox')
        return
      }
      const data = (await res.json()) as { messages: InboxMessage[]; unreadCount: number }
      setMessages(data.messages)
      setUnreadCount(data.unreadCount)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token, filterType, unreadOnly, apiUrl])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function handleMarkRead(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/inbox/${id}/read`, { method: 'PATCH', headers })
      if (!res.ok) { showToast('Failed to mark as read'); return }
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: 'READ' } : m))
      setUnreadCount((c) => Math.max(0, c - 1))
      showToast('Marked as read')
    } catch {
      showToast('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDismiss(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/inbox/${id}/dismiss`, { method: 'PATCH', headers })
      if (!res.ok) { showToast('Failed to dismiss'); return }
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: 'DISMISSED' } : m))
      if (messages.find((m) => m.id === id)?.status === 'UNREAD') {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      showToast('Dismissed')
    } catch {
      showToast('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReply(id: string) {
    if (!replyText.trim()) return
    setActionLoading(id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/inbox/${id}/reply`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ reply: replyText.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to save reply')
        return
      }
      const data = (await res.json()) as { message: InboxMessage }
      setMessages((prev) => prev.map((m) => m.id === id ? data.message : m))
      if (messages.find((m) => m.id === id)?.status === 'UNREAD') {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      setReplyingId(null)
      setReplyText('')
      showToast('Reply saved!')
    } catch {
      showToast('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSeed() {
    if (!activeWorkspace) return
    setSeedLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/inbox/seed?workspaceId=${activeWorkspace.id}`, {
        method: 'POST',
        headers,
      })
      const body = (await res.json()) as { seeded?: number; error?: string }
      if (!res.ok) {
        showToast(body.error ?? 'Failed to seed messages')
        return
      }
      showToast(`Loaded ${body.seeded ?? 0} demo messages!`)
      fetchMessages()
    } catch {
      showToast('Network error')
    } finally {
      setSeedLoading(false)
    }
  }

  async function handleAiDraft(msg: InboxMessage) {
    setAiDraftLoading(msg.id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/draft-reply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: msg.content, platform: msg.platform, tone: replyTone }),
      })
      if (!res.ok) { showToast('AI draft failed'); return }
      const data = (await res.json()) as { reply: string }
      setReplyText(data.reply)
    } catch {
      showToast('Network error')
    } finally {
      setAiDraftLoading(null)
    }
  }

  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to view your inbox.</p>
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(['ALL', 'COMMENT', 'MENTION', 'DM'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filterType === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {f === 'ALL' ? 'All' : f === 'COMMENT' ? 'Comments' : f === 'MENTION' ? 'Mentions' : 'DMs'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn(
            'ml-auto px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            unreadOnly
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-border text-muted-foreground hover:border-foreground'
          )}
        >
          {unreadOnly ? '● Unread only' : '○ Unread only'}
        </button>
        {unreadCount > 0 && (
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchMessages}>Retry</Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && messages.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-4">
          <div className="text-4xl">📬</div>
          <div>
            <p className="font-semibold text-lg">Your inbox is empty</p>
            <p className="text-sm text-muted-foreground mt-1">
              Comments, mentions, and DMs from your connected platforms will appear here.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleSeed}
            disabled={seedLoading}
            className="mt-2"
          >
            {seedLoading ? 'Loading…' : 'Load Demo Messages'}
          </Button>
        </div>
      )}

      {/* Message list */}
      {!loading && !error && messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((msg) => {
            const platform = PLATFORM_STYLES[msg.platform] ?? { bg: 'bg-muted', text: 'text-foreground', label: '?' }
            const isUnread = msg.status === 'UNREAD'
            const isReplying = replyingId === msg.id
            const isDismissed = msg.status === 'DISMISSED'

            return (
              <div
                key={msg.id}
                className={cn(
                  'rounded-lg border bg-background overflow-hidden transition-opacity',
                  isUnread && 'border-l-4 border-l-blue-500',
                  isDismissed && 'opacity-50'
                )}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Platform icon */}
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm', platform.bg, platform.text)}>
                      {platform.label}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Author + meta */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{msg.authorName}</span>
                        {msg.authorHandle && (
                          <span className="text-xs text-muted-foreground">{msg.authorHandle}</span>
                        )}
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_BADGE[msg.type] ?? 'bg-muted text-muted-foreground')}>
                          {msg.type === 'COMMENT' ? 'Comment' : msg.type === 'MENTION' ? 'Mention' : 'DM'}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        </span>
                      </div>

                      {/* Content */}
                      <p className="text-sm mt-1 leading-relaxed">{msg.content}</p>

                      {/* Existing reply */}
                      {msg.status === 'REPLIED' && msg.reply && (
                        <div className="mt-2 pl-3 border-l-2 border-muted-foreground/30 text-xs text-muted-foreground">
                          <span className="font-medium">Your reply:</span> {msg.reply}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reply form */}
                  {isReplying && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                        Note: This saves your reply in OmniPulse. To post it on the platform, you'll need to connect OAuth access for that account.
                      </div>
                      <Textarea
                        placeholder="Write your reply…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        className="text-sm resize-none"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleReply(msg.id)}
                          disabled={actionLoading === msg.id || !replyText.trim()}
                        >
                          {actionLoading === msg.id ? 'Saving…' : 'Send Reply'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => { setReplyingId(null); setReplyText('') }}
                        >
                          Cancel
                        </Button>
                        <div className="ml-auto flex items-center gap-2">
                          <select
                            value={replyTone}
                            onChange={(e) => setReplyTone(e.target.value)}
                            className="h-7 text-xs rounded-md border border-input bg-background px-2 text-foreground"
                          >
                            <option value="friendly">Friendly</option>
                            <option value="professional">Professional</option>
                            <option value="casual">Casual</option>
                            <option value="empathetic">Empathetic</option>
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleAiDraft(msg)}
                            disabled={aiDraftLoading === msg.id}
                          >
                            {aiDraftLoading === msg.id ? (
                              <>
                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Drafting…
                              </>
                            ) : '✨ AI Draft'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!isReplying && !isDismissed && (
                    <div className="flex gap-2 pt-1 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setReplyingId(msg.id); setReplyText('') }}
                        disabled={!!actionLoading}
                      >
                        Reply
                      </Button>
                      {isUnread && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => handleMarkRead(msg.id)}
                          disabled={actionLoading === msg.id}
                        >
                          {actionLoading === msg.id ? '…' : 'Mark Read'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground ml-auto"
                        onClick={() => handleDismiss(msg.id)}
                        disabled={actionLoading === msg.id}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
