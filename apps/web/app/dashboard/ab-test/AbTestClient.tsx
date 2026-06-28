'use client'

import { useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

function PostCard({ post, label }: { post: Post; label: string }) {
  return (
    <div className="rounded-lg border bg-background p-4 space-y-3 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{post.status}</span>
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

export default function AbTestClient({ token }: Props) {
  const { activeWorkspace } = useWorkspace()

  // Create variant state
  const [createPostId, setCreatePostId] = useState('')
  const [variantContent, setVariantContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // View results state
  const [resultsPostId, setResultsPostId] = useState('')
  const [loadingResults, setLoadingResults] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const [results, setResults] = useState<{ original: Post; variants: Post[] } | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  async function handleCreateVariant() {
    if (!createPostId.trim()) { setCreateError('Post ID is required'); return }
    if (!variantContent.trim()) { setCreateError('Variant content is required'); return }
    setCreating(true)
    setCreateError(null)
    setCreateSuccess(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${createPostId.trim()}/ab-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: variantContent.trim() }),
      })
      const data = (await res.json()) as { variant?: Post; error?: string }
      if (!res.ok) {
        setCreateError(data.error ?? 'Failed to create variant')
        return
      }
      setCreateSuccess(`Variant created! ID: ${data.variant?.id}`)
      setVariantContent('')
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  async function handleViewResults() {
    if (!resultsPostId.trim()) { setResultsError('Post ID is required'); return }
    setLoadingResults(true)
    setResultsError(null)
    setResults(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${resultsPostId.trim()}/ab-variants`, {
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">A/B Testing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create content variants and compare their performance.
          {activeWorkspace && (
            <span className="ml-1">Workspace: <strong>{activeWorkspace.name}</strong></span>
          )}
        </p>
      </div>

      {/* Create Variant */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create Variant (B)</h2>
        <p className="text-sm text-muted-foreground">
          Enter the original post ID and write an alternative caption to test against it.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="create-post-id">Original Post ID</Label>
          <Input
            id="create-post-id"
            placeholder="e.g. clx1234abcd..."
            value={createPostId}
            onChange={(e) => setCreatePostId(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="variant-content">Variant B Content</Label>
          <Textarea
            id="variant-content"
            placeholder="Write the alternative caption for your A/B test..."
            value={variantContent}
            onChange={(e) => setVariantContent(e.target.value)}
            rows={4}
          />
        </div>

        {createError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{createError}</p>
        )}
        {createSuccess && (
          <p className="text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 px-3 py-2 rounded-md">
            {createSuccess}
          </p>
        )}

        <Button onClick={handleCreateVariant} disabled={creating}>
          {creating ? 'Creating…' : 'Create Variant'}
        </Button>
      </section>

      {/* View Results */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">View A/B Results</h2>
        <p className="text-sm text-muted-foreground">
          Enter the original post ID to compare it against all its variants.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="Original Post ID"
            value={resultsPostId}
            onChange={(e) => setResultsPostId(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleViewResults} disabled={loadingResults} variant="outline">
            {loadingResults ? 'Loading…' : 'Fetch Results'}
          </Button>
        </div>

        {resultsError && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{resultsError}</p>
        )}

        {results && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Comparison</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-4 flex-col sm:flex-row">
              <PostCard post={results.original} label="A — Original" />
              {results.variants.length === 0 ? (
                <div className="flex-1 rounded-lg border border-dashed p-8 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center">
                    No variants yet.<br />Create one using the form above.
                  </p>
                </div>
              ) : (
                results.variants.map((v, i) => (
                  <PostCard key={v.id} post={v} label={`B${results.variants.length > 1 ? String(i + 1) : ''} — Variant`} />
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
