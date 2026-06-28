'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Metric {
  platform: string
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
}

interface Post {
  id: string
  content: string
  platforms: string[]
  status: string
  scheduledFor: string
  mediaUrls: string[]
  metrics?: Metric[]
  abTestActive?: boolean
  abVariantOf?: string | null
}

interface Props {
  token: string
}

// ── Post picker ──────────────────────────────────────────────────────────────

function PostPicker({
  token,
  workspaceId,
  apiUrl,
  selectedId,
  onSelect,
  placeholder,
}: {
  token: string
  workspaceId: string
  apiUrl: string
  selectedId: string
  onSelect: (post: Post) => void
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Post | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchPosts = useCallback(async (search: string) => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ workspaceId, limit: '30' })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`${apiUrl}/api/v1/posts/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = (await res.json()) as { posts: Post[] }
      setPosts(data.posts ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [workspaceId, apiUrl, token])

  // Load posts when dropdown opens
  useEffect(() => {
    if (open) fetchPosts(query)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => fetchPosts(query), 300)
    return () => clearTimeout(t)
  }, [query, open, fetchPosts])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(post: Post) {
    setSelected(post)
    setQuery('')
    setOpen(false)
    onSelect(post)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    onSelect({ id: '', content: '', platforms: [], status: '', scheduledFor: '', mediaUrls: [] })
  }

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div className="rounded-lg border bg-muted/30 p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {selected.platforms.map((p) => (
                <span key={p} className="text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {p}
                </span>
              ))}
              <span className="text-[10px] text-muted-foreground">{selected.status}</span>
            </div>
            <p className="text-sm line-clamp-2">{selected.content}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(selected.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={handleClear}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-xs"
            title="Change post"
          >
            ✕
          </button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {open && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Loading posts…</div>
              ) : posts.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No posts found</div>
              ) : (
                <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                  {posts.map((post) => (
                    <li key={post.id}>
                      <button
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors"
                        onClick={() => handleSelect(post)}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {post.platforms.slice(0, 3).map((p) => (
                            <span key={p} className="text-[10px] font-semibold uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {p}
                            </span>
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(post.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2 text-foreground">{post.content}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Metric summary card ───────────────────────────────────────────────────────

function MetricsSummary({ metrics }: { metrics?: Metric[] }) {
  if (!metrics || metrics.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No metrics yet</p>
  }
  const totals = metrics.reduce(
    (acc, m) => ({
      likes: acc.likes + (m.likes ?? 0),
      comments: acc.comments + (m.comments ?? 0),
      shares: acc.shares + (m.shares ?? 0),
      reach: acc.reach + (m.reach ?? 0),
    }),
    { likes: 0, comments: 0, shares: 0, reach: 0 },
  )
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {[
        { label: 'Likes', value: totals.likes },
        { label: 'Comments', value: totals.comments },
        { label: 'Shares', value: totals.shares },
        { label: 'Reach', value: totals.reach },
      ].map(({ label, value }) => (
        <div key={label} className="text-center rounded-md bg-muted/50 p-2">
          <p className="text-lg font-bold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
      ))}
    </div>
  )
}

function PostCard({ post, label, winner }: { post: Post; label: string; winner?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 space-y-3 flex-1 min-w-0 ${winner ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20' : 'bg-background'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{post.status}</span>
        {winner && (
          <span className="ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            🏆 Winning
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-medium mb-1">Content</p>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6 bg-muted/30 rounded p-2">
          {post.content}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-1">Platforms</p>
        <div className="flex flex-wrap gap-1">
          {post.platforms.map((p) => (
            <span key={p} className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted">
              {p}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-1">Metrics</p>
        <MetricsSummary metrics={post.metrics} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AbTestClient({ token }: Props) {
  const { activeWorkspace } = useWorkspace()

  const [createPost, setCreatePost] = useState<Post | null>(null)
  const [variantContent, setVariantContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  const [resultsPost, setResultsPost] = useState<Post | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const [results, setResults] = useState<{ original: Post; variants: Post[] } | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const workspaceId = activeWorkspace?.id ?? ''

  // Auto-fetch results when a post is selected in the results picker
  useEffect(() => {
    if (resultsPost?.id) {
      handleViewResults(resultsPost.id)
    }
  }, [resultsPost?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateVariant() {
    if (!createPost?.id) { setCreateError('Please select a post'); return }
    if (!variantContent.trim()) { setCreateError('Variant content is required'); return }
    setCreating(true)
    setCreateError(null)
    setCreateSuccess(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${createPost.id}/ab-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: variantContent.trim() }),
      })
      const data = (await res.json()) as { variant?: Post; error?: string }
      if (!res.ok) {
        setCreateError(data.error ?? 'Failed to create variant')
        return
      }
      setCreateSuccess('Variant B created! Switch to "View Results" to compare performance.')
      setVariantContent('')
      // Refresh results if we're looking at the same post
      if (resultsPost?.id === createPost.id) handleViewResults(createPost.id)
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  async function handleViewResults(postId: string) {
    setLoadingResults(true)
    setResultsError(null)
    setResults(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/ab-variants`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { original?: Post; variants?: Post[]; error?: string }
      if (!res.ok) {
        setResultsError(data.error ?? 'Failed to fetch results')
        return
      }
      setResults({ original: data.original!, variants: data.variants ?? [] })
    } catch {
      setResultsError('Network error — please try again')
    } finally {
      setLoadingResults(false)
    }
  }

  // Determine winner (highest total engagement)
  function totalEngagement(post: Post) {
    return (post.metrics ?? []).reduce((s, m) => s + m.likes + m.comments + m.shares, 0)
  }
  const allPosts = results ? [results.original, ...results.variants] : []
  const maxEngagement = Math.max(...allPosts.map(totalEngagement))
  const hasMetrics = allPosts.some((p) => (p.metrics?.length ?? 0) > 0)
  const winnerId = hasMetrics && maxEngagement > 0
    ? allPosts.find((p) => totalEngagement(p) === maxEngagement)?.id
    : null

  if (!activeWorkspace) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Select a workspace to use A/B testing.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">A/B Testing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pick a post, write a variant caption, and compare their performance.
        </p>
      </div>

      {/* ── Create Variant ── */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Create Variant B</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select any published or scheduled post as your control (A), then write an alternative caption.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Original Post (A)</Label>
          <PostPicker
            token={token}
            workspaceId={workspaceId}
            apiUrl={apiUrl}
            selectedId={createPost?.id ?? ''}
            onSelect={(p) => setCreatePost(p.id ? p : null)}
            placeholder="Search your posts…"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="variant-content">Variant B Caption</Label>
          <Textarea
            id="variant-content"
            placeholder="Write the alternative caption for your A/B test…"
            value={variantContent}
            onChange={(e) => setVariantContent(e.target.value)}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {variantContent.length} characters
          </p>
        </div>

        {createError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{createError}</p>
        )}
        {createSuccess && (
          <p className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-3 py-2 rounded-md">
            ✓ {createSuccess}
          </p>
        )}

        <Button
          onClick={handleCreateVariant}
          disabled={creating || !createPost?.id || !variantContent.trim()}
        >
          {creating ? 'Creating…' : 'Create Variant B'}
        </Button>
      </section>

      {/* ── View Results ── */}
      <section className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Compare Results</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select the original post to see how A and B performed side by side.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Post to Compare</Label>
          <PostPicker
            token={token}
            workspaceId={workspaceId}
            apiUrl={apiUrl}
            selectedId={resultsPost?.id ?? ''}
            onSelect={(p) => setResultsPost(p.id ? p : null)}
            placeholder="Search your posts…"
          />
        </div>

        {loadingResults && (
          <div className="flex items-center gap-3 py-4">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="block w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">Loading results…</span>
          </div>
        )}

        {resultsError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{resultsError}</p>
        )}

        {results && !loadingResults && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {results.variants.length === 0 ? 'No variants yet' : `${1 + results.variants.length} versions`}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-4 flex-col sm:flex-row">
              <PostCard
                post={results.original}
                label="A — Original"
                winner={winnerId === results.original.id}
              />
              {results.variants.length === 0 ? (
                <div className="flex-1 rounded-lg border border-dashed p-8 flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted-foreground">No variants yet.</p>
                  <p className="text-xs text-muted-foreground">Use the form above to create Variant B.</p>
                </div>
              ) : (
                results.variants.map((v, i) => (
                  <PostCard
                    key={v.id}
                    post={v}
                    label={`B${results.variants.length > 1 ? String(i + 1) : ''} — Variant`}
                    winner={winnerId === v.id}
                  />
                ))
              )}
            </div>

            {!hasMetrics && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                Metrics will appear here once your posts have been published and data synced.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
