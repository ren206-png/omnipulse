'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'

interface RssFeed {
  id: string
  name: string
  url: string
  platforms: string[]
  active: boolean
  checkInterval: number
  lastCheckedAt?: string
  createdAt: string
}

interface Props {
  token: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
const ALL_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE']

export function RssFeeds({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [feeds, setFeeds] = useState<RssFeed[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [checkResults, setCheckResults] = useState<Record<string, number>>({})
  const [checking, setChecking] = useState<Record<string, boolean>>({})

  // Form state
  const [formUrl, setFormUrl] = useState('')
  const [formName, setFormName] = useState('')
  const [formPlatforms, setFormPlatforms] = useState<string[]>([])
  const [formInterval, setFormInterval] = useState('60')
  const [submitting, setSubmitting] = useState(false)

  const fetchFeeds = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/rss?workspaceId=${activeWorkspace.id}`, {
        headers: { Cookie: `token=${token}` },
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      setFeeds(data.feeds)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchFeeds() }, [fetchFeeds])

  async function toggleActive(feed: RssFeed) {
    await fetch(`${API}/api/v1/rss/${feed.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
      credentials: 'include',
      body: JSON.stringify({ active: !feed.active }),
    })
    fetchFeeds()
  }

  async function deleteFeed(id: string) {
    await fetch(`${API}/api/v1/rss/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `token=${token}` },
      credentials: 'include',
    })
    fetchFeeds()
  }

  async function checkNow(id: string) {
    setChecking((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`${API}/api/v1/rss/${id}/check`, {
        method: 'POST',
        headers: { Cookie: `token=${token}` },
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      setCheckResults((prev) => ({ ...prev, [id]: data.newPosts }))
      fetchFeeds()
    } finally {
      setChecking((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function submitFeed(e: React.FormEvent) {
    e.preventDefault()
    if (!activeWorkspace) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/v1/rss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
        credentials: 'include',
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          url: formUrl.trim(),
          name: formName.trim(),
          platforms: formPlatforms,
          checkInterval: parseInt(formInterval) || 60,
        }),
      })
      if (!res.ok) return
      setShowForm(false)
      setFormUrl('')
      setFormName('')
      setFormPlatforms([])
      setFormInterval('60')
      fetchFeeds()
    } finally {
      setSubmitting(false)
    }
  }

  function togglePlatform(p: string) {
    setFormPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RSS Auto-posting</h1>
          <p className="text-sm text-muted-foreground mt-1">Automatically create posts from RSS feeds.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add RSS Feed
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitFeed} className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold">New RSS Feed</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Feed URL</label>
              <input
                type="url"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My Blog Feed"
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    formPlatforms.includes(p)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent/50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 w-40">
            <label className="text-sm font-medium">Check Interval (minutes)</label>
            <input
              type="number"
              min={5}
              value={formInterval}
              onChange={(e) => setFormInterval(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-accent/50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add Feed'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-40 mb-2" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
          ))
        ) : feeds.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground text-sm">
            No RSS feeds yet. Add one to start auto-posting.
          </div>
        ) : (
          feeds.map((feed) => (
            <div key={feed.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{feed.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      feed.active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                    }`}>
                      {feed.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{feed.url}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {feed.platforms.map((p) => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p}</span>
                    ))}
                    {feed.lastCheckedAt && (
                      <span className="text-xs text-muted-foreground">
                        Last checked: {new Date(feed.lastCheckedAt).toLocaleString()}
                      </span>
                    )}
                    {checkResults[feed.id] !== undefined && (
                      <span className="text-xs text-green-600 font-medium">
                        {checkResults[feed.id]} new post{checkResults[feed.id] !== 1 ? 's' : ''} found
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => checkNow(feed.id)}
                    disabled={checking[feed.id]}
                    className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-accent/50 disabled:opacity-50 transition-colors"
                  >
                    {checking[feed.id] ? 'Checking…' : 'Check Now'}
                  </button>
                  <button
                    onClick={() => toggleActive(feed)}
                    className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-accent/50 transition-colors"
                  >
                    {feed.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => deleteFeed(feed.id)}
                    className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
