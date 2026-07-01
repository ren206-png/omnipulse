'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

const STATUS_FILTERS = ['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'] as const
const PLATFORM_FILTERS = ['ALL', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN'] as const

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
  LINKEDIN: 'bg-sky-100 text-sky-700',
}

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-700',
  QUEUED: 'bg-purple-100 text-purple-700',
}

interface PostMetrics {
  likes: number
  comments: number
  shares: number
}

interface Post {
  id: string
  content: string
  platforms: string[]
  status: string
  scheduledFor: string | null
  mediaUrls: string[]
  metrics: PostMetrics
}

interface HistoryResponse {
  posts: Post[]
  total: number
  page: number
  totalPages: number
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 bg-muted rounded-full" />
        <div className="h-5 w-16 bg-muted rounded-full" />
        <div className="ml-auto h-5 w-24 bg-muted rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
      <div className="flex gap-4">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-3 w-16 bg-muted rounded" />
      </div>
    </div>
  )
}

export function PostHistory({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const router = useRouter()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  const [platform, setPlatform] = useState<string>('ALL')
  const [page, setPage] = useState(1)

  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingPostId, setRetryingPostId] = useState<string | null>(null)
  const [retryMessage, setRetryMessage] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const fetchHistory = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        workspaceId: activeWorkspace.id,
        page: String(page),
        limit: '20',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (status !== 'ALL') params.set('status', status)
      if (platform !== 'ALL') params.set('platform', platform)

      const res = await fetch(`${apiUrl}/api/v1/posts/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load history')
        return
      }
      const data = (await res.json()) as HistoryResponse
      setPosts(data.posts)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token, apiUrl, page, debouncedSearch, status, platform])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [status, platform])

  async function retryPost(post: Post) {
    setRetryingPostId(post.id)
    setRetryMessage(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${post.id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setRetryMessage(body.error ?? 'Failed to retry post')
        return
      }
      setRetryMessage('Post rescheduled for retry in 5 minutes')
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
    } catch {
      setRetryMessage('Network error — please try again')
    } finally {
      setRetryingPostId(null)
    }
  }

  function reusePost(post: Post) {
    const params = new URLSearchParams({
      reuse: '1',
      content: post.content,
      platforms: post.platforms.join(','),
    })
    if (post.mediaUrls.length > 0) {
      params.set('mediaUrls', post.mediaUrls.join(','))
    }
    router.push(`/dashboard/calendar?${params.toString()}`)
  }

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setStatus('ALL')
    setPlatform('ALL')
    setPage(1)
  }

  const hasFilters = debouncedSearch || status !== 'ALL' || platform !== 'ALL'

  return (
    <div className="space-y-4">
      {/* Search */}
      <Input
        placeholder="Search posts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1) }}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              status === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:border-foreground/30 text-muted-foreground',
            )}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Platform filter pills */}
      <div className="flex flex-wrap gap-2">
        {PLATFORM_FILTERS.map((p) => (
          <button
            key={p}
            onClick={() => { setPlatform(p); setPage(1) }}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              platform === p
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:border-foreground/30 text-muted-foreground',
            )}
          >
            {p === 'ALL' ? 'All Platforms' : p.charAt(0) + p.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Results count */}
      {!loading && !error && (
        <p className="text-sm text-muted-foreground">
          {total} post{total !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Retry message */}
      {retryMessage && (
        <div className={cn(
          'rounded-lg border px-4 py-3 text-sm',
          retryMessage.startsWith('Post rescheduled')
            ? 'border-green-300 bg-green-50 text-green-700'
            : 'border-destructive/30 bg-destructive/10 text-destructive',
        )}>
          {retryMessage}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="text-5xl">{hasFilters ? '🔍' : '📭'}</div>
          <p className="font-semibold text-lg">{hasFilters ? 'No matching posts' : 'No posts yet'}</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {hasFilters
              ? 'Try adjusting your search or filters to find what you\'re looking for.'
              : 'Once you schedule or publish posts, they\'ll appear here with engagement metrics.'}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
            {!hasFilters && (
              <a
                href="/dashboard/calendar"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                📅 Schedule a Post
              </a>
            )}
          </div>
        </div>
      )}

      {/* Post list */}
      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-lg border bg-card p-4 space-y-2.5">
              {/* Header row: platforms + status + date */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1.5 flex-wrap">
                  {post.platforms.map((p) => (
                    <span
                      key={p}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </span>
                  ))}
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    STATUS_COLORS[post.status] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {post.status.replace(/_/g, ' ')}
                </span>
                {post.scheduledFor && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(post.scheduledFor), 'MMM d, yyyy · h:mm a')}
                  </span>
                )}
              </div>

              {/* Content preview */}
              <p className="text-sm line-clamp-2 leading-relaxed">{post.content}</p>

              {/* Engagement metrics + reuse */}
              <div className="flex items-center justify-between gap-2">
                {(post.metrics.likes > 0 || post.metrics.comments > 0 || post.metrics.shares > 0) ? (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>❤️ {post.metrics.likes.toLocaleString()} likes</span>
                    <span>💬 {post.metrics.comments.toLocaleString()} comments</span>
                    <span>🔁 {post.metrics.shares.toLocaleString()} shares</span>
                  </div>
                ) : <div />}
                <div className="flex items-center gap-1.5">
                  {post.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryPost(post)}
                      disabled={retryingPostId === post.id}
                      className="text-xs text-muted-foreground hover:text-orange-600 border border-border hover:border-orange-400/60 rounded-md px-2 py-0.5 transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Retry this failed post"
                    >
                      {retryingPostId === post.id ? '⏳ Retrying…' : '🔄 Retry'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => reusePost(post)}
                    className="text-xs text-muted-foreground hover:text-primary border border-border hover:border-primary/40 rounded-md px-2 py-0.5 transition-colors flex items-center gap-1 shrink-0"
                    title="Reuse this post"
                  >
                    ♻️ Reuse
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
