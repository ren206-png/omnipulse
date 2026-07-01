'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
const MAX_KEYWORDS = 10

type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X' | 'GOOGLE' | 'LINKEDIN'

interface ListeningKeyword {
  id: string
  keyword: string
  active: boolean
  createdAt: string
}

interface Mention {
  id: string
  socialAccountId: string
  platform: Platform
  authorName: string
  content: string
  createdAt: string
}

const PLATFORM_ICONS: Record<Platform, string> = {
  X: '🐦',
  FACEBOOK: '📘',
  INSTAGRAM: '📸',
  LINKEDIN: '💼',
  TIKTOK: '🎵',
  GOOGLE: '🔍',
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

function MentionSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="h-3 bg-muted rounded w-1/3" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function ListeningClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id

  const [keywords, setKeywords] = useState<ListeningKeyword[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(false)
  const [newKeyword, setNewKeyword] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [mentions, setMentions] = useState<Mention[]>([])
  const [mentionsLoading, setMentionsLoading] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchKeywords = useCallback(async () => {
    if (!workspaceId) return
    setKeywordsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/listening?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as { keywords: ListeningKeyword[] }
        setKeywords(data.keywords)
        if (data.keywords.length > 0 && !activeTab) {
          setActiveTab(data.keywords[0].keyword)
        }
      }
    } finally {
      setKeywordsLoading(false)
    }
  }, [workspaceId, token, activeTab])

  const fetchMentions = useCallback(async (keyword: string) => {
    if (!workspaceId || !keyword) return
    setMentionsLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/api/v1/listening/mentions?workspaceId=${workspaceId}&keyword=${encodeURIComponent(keyword)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.ok) {
        const data = (await res.json()) as { mentions: Mention[] }
        setMentions(data.mentions)
      }
    } finally {
      setMentionsLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => {
    fetchKeywords()
  }, [fetchKeywords])

  useEffect(() => {
    if (activeTab) {
      fetchMentions(activeTab)
    }
  }, [activeTab, fetchMentions])

  // Auto-refresh every 60s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      fetchKeywords()
      if (activeTab) fetchMentions(activeTab)
    }, 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchKeywords, fetchMentions, activeTab])

  async function handleAdd() {
    const kw = newKeyword.trim()
    if (!kw) { setAddError('Please enter a keyword'); return }
    if (!workspaceId) { setAddError('No active workspace'); return }
    if (keywords.length >= MAX_KEYWORDS) { setAddError(`Maximum ${MAX_KEYWORDS} keywords allowed`); return }
    setAddLoading(true)
    setAddError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/listening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, keyword: kw }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        setAddError(body.message ?? 'Failed to add keyword')
        return
      }
      const data = (await res.json()) as { keyword: ListeningKeyword }
      const updated = [...keywords, data.keyword]
      setKeywords(updated)
      setNewKeyword('')
      if (!activeTab) setActiveTab(data.keyword.keyword)
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDelete(id: string, keyword: string) {
    try {
      await fetch(`${API_URL}/api/v1/listening/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = keywords.filter((k) => k.id !== id)
      setKeywords(updated)
      if (activeTab === keyword) {
        setActiveTab(updated.length > 0 ? updated[0].keyword : null)
        setMentions([])
      }
    } catch {
      // silent fail
    }
  }

  const atLimit = keywords.length >= MAX_KEYWORDS

  return (
    <div className="space-y-6">
      {/* Keyword Manager */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-base">Keyword Manager</h2>

        {atLimit && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            You have reached the maximum of {MAX_KEYWORDS} keywords. Remove one to add another.
          </p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            placeholder="Enter a keyword or phrase…"
            value={newKeyword}
            disabled={atLimit || addLoading}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          <button
            onClick={handleAdd}
            disabled={atLimit || addLoading}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {addLoading ? 'Adding…' : 'Add'}
          </button>
        </div>

        {addError && <p className="text-xs text-destructive">{addError}</p>}

        {keywordsLoading && keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading keywords…</p>
        ) : keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keywords yet. Add one above to start listening.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium"
              >
                {kw.keyword}
                <button
                  onClick={() => handleDelete(kw.id, kw.keyword)}
                  className="ml-0.5 text-primary/70 hover:text-primary transition-colors leading-none"
                  aria-label={`Remove ${kw.keyword}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mentions Feed */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-base">Mentions Feed</h2>

        {keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add keywords above to see mentions.</p>
        ) : (
          <>
            {/* Keyword tabs */}
            <div className="flex flex-wrap gap-2 border-b pb-3">
              {keywords.map((kw) => (
                <button
                  key={kw.id}
                  onClick={() => setActiveTab(kw.keyword)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    activeTab === kw.keyword
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {kw.keyword}
                </button>
              ))}
            </div>

            {/* Mentions list */}
            {mentionsLoading ? (
              <MentionSkeleton />
            ) : mentions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No mentions found for &ldquo;{activeTab}&rdquo;
              </p>
            ) : (
              <div className="space-y-3">
                {mentions.map((m) => (
                  <div key={m.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{PLATFORM_ICONS[m.platform] ?? '💬'}</span>
                        <span>{m.authorName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{relativeTime(m.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
