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
const ALL_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN']

const INTERVAL_OPTIONS = [
  { label: '30 min', value: '30' },
  { label: '60 min', value: '60' },
  { label: '2 hrs', value: '120' },
  { label: '6 hrs', value: '360' },
  { label: '24 hrs', value: '1440' },
]

function formatInterval(minutes: number): string {
  if (minutes >= 1440) return `${minutes / 1440} day${minutes / 1440 !== 1 ? 's' : ''}`
  if (minutes >= 60) return `${minutes / 60} hr${minutes / 60 !== 1 ? 's' : ''}`
  return `${minutes} min`
}

function truncateUrl(url: string, max = 55): string {
  return url.length > max ? url.slice(0, max) + '…' : url
}

export function RssFeeds({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [feeds, setFeeds] = useState<RssFeed[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [checkResults, setCheckResults] = useState<Record<string, number>>({})
  const [checking, setChecking] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [formUrl, setFormUrl] = useState('')
  const [formName, setFormName] = useState('')
  const [formPlatforms, setFormPlatforms] = useState<string[]>([])
  const [formInterval, setFormInterval] = useState('60')
  const [submitting, setSubmitting] = useState(false)

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  }

  const fetchFeeds = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/rss?workspaceId=${activeWorkspace.id}`, {
        headers: authHeaders,
      })
      if (!res.ok) return
      const data = await res.json()
      setFeeds(data.feeds ?? [])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, token])

  useEffect(() => { fetchFeeds() }, [fetchFeeds])

  async function toggleActive(feed: RssFeed) {
    setToggling((prev) => ({ ...prev, [feed.id]: true }))
    try {
      await fetch(`${API}/api/v1/rss/${feed.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !feed.active }),
      })
      await fetchFeeds()
    } finally {
      setToggling((prev) => ({ ...prev, [feed.id]: false }))
    }
  }

  async function deleteFeed(id: string) {
    setDeleting((prev) => ({ ...prev, [id]: true }))
    try {
      await fetch(`${API}/api/v1/rss/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      await fetchFeeds()
    } finally {
      setDeleting((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function checkNow(id: string) {
    setChecking((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`${API}/api/v1/rss/${id}/check`, {
        method: 'POST',
        headers: authHeaders,
      })
      if (!res.ok) return
      const data = await res.json()
      setCheckResults((prev) => ({ ...prev, [id]: data.newPosts }))
      await fetchFeeds()
    } finally {
      setChecking((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function submitFeed(e: React.FormEvent) {
    e.preventDefault()
    if (!activeWorkspace) return
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${API}/api/v1/rss?workspaceId=${activeWorkspace.id}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          url: formUrl.trim(),
          name: formName.trim(),
          platforms: formPlatforms,
          checkInterval: parseInt(formInterval, 10) || 60,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        setFormError(data.message ?? 'Failed to add feed')
        return
      }
      setShowForm(false)
      setFormUrl('')
      setFormName('')
      setFormPlatforms([])
      setFormInterval('60')
      await fetchFeeds()
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
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RSS Auto-post Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically create draft posts from RSS feeds and publish to your social accounts.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null) }}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add RSS Feed'}
        </button>
      </div>

      {/* Add feed form */}
      {showForm && (
        <form onSubmit={submitFeed} className="rounded-xl border bg-card p-6 space-y-5">
          <h2 className="text-base font-semibold">New RSS Feed</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Feed URL</label>
              <input
                type="url"
                required
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://blog.example.com/rss.xml"
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
            <label className="text-sm font-medium">Platforms to auto-post to</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    formPlatforms.includes(p)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent/50 border-border'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 w-48">
            <label className="text-sm font-medium">Check interval</label>
            <select
              value={formInterval}
              onChange={(e) => setFormInterval(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {formError}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="px-4 py-2 text-sm rounded-lg border hover:bg-accent/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add RSS Feed'}
            </button>
          </div>
        </form>
      )}

      {/* Feed list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-40 mb-2" />
              <div className="h-3 bg-muted rounded w-64" />
            </div>
          ))
        ) : feeds.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No RSS feeds yet — add one to auto-post new articles to your social accounts.
            </p>
          </div>
        ) : (
          feeds.map((feed) => (
            <div key={feed.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{feed.name}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        feed.active
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {feed.active ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-0.5" title={feed.url}>
                    {truncateUrl(feed.url)}
                  </p>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {feed.platforms.length > 0 ? (
                      feed.platforms.map((p) => (
                        <span
                          key={p}
                          className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                        >
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No platforms</span>
                    )}

                    <span className="text-xs text-muted-foreground">
                      · Every {formatInterval(feed.checkInterval)}
                    </span>

                    {feed.lastCheckedAt && (
                      <span className="text-xs text-muted-foreground">
                        · Last checked {new Date(feed.lastCheckedAt).toLocaleString()}
                      </span>
                    )}

                    {checkResults[feed.id] !== undefined && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        · {checkResults[feed.id]} new post{checkResults[feed.id] !== 1 ? 's' : ''} found
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {/* Active toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={feed.active}
                    onClick={() => toggleActive(feed)}
                    disabled={toggling[feed.id]}
                    title={feed.active ? 'Pause feed' : 'Resume feed'}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                      feed.active ? 'bg-primary' : 'bg-input'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                        feed.active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => checkNow(feed.id)}
                    disabled={checking[feed.id]}
                    className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-accent/50 disabled:opacity-50 transition-colors"
                  >
                    {checking[feed.id] ? 'Checking…' : 'Check Now'}
                  </button>

                  <button
                    onClick={() => deleteFeed(feed.id)}
                    disabled={deleting[feed.id]}
                    className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                  >
                    {deleting[feed.id] ? 'Deleting…' : 'Delete'}
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
