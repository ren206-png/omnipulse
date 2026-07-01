'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const PLATFORM_ICONS: Record<string, string> = {
  X: '🐦',
  INSTAGRAM: '📸',
  FACEBOOK: '📘',
  LINKEDIN: '💼',
  TIKTOK: '🎵',
  GOOGLE: '🔍',
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
  LINKEDIN: 'bg-sky-100 text-sky-700',
}

interface PostMetric {
  platform: string
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
  recordedAt: string
}

interface PostComment {
  id: string
  userId: string
  userEmail: string
  body: string
  createdAt: string
}

interface AnalyticsData {
  post: {
    id: string
    content: string
    platforms: string[]
    scheduledFor: string
    status: string
    campaignId: string | null
  }
  metrics: PostMetric[]
  totals: {
    likes: number
    comments: number
    shares: number
    reach: number
    impressions: number
    engagement: number
  }
  commentCount: number
  comments: PostComment[]
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-5 animate-pulse space-y-3', className)}>
      <div className="h-4 bg-muted rounded w-1/3" />
      <div className="h-8 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-1/4" />
    </div>
  )
}

export function PostAnalyticsClient({ token, postId }: { token: string; postId: string }) {
  const router = useRouter()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/analytics`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const body = (await res.json()) as { error?: string }
          setError(body.error ?? 'Failed to load analytics')
          return
        }
        const json = (await res.json()) as AnalyticsData
        setData(json)
      } catch {
        setError('Network error — please try again')
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [apiUrl, token, postId])

  const engagementColor =
    !data ? '' :
    data.totals.engagement > 5 ? 'text-green-600' :
    data.totals.engagement > 2 ? 'text-yellow-600' :
    'text-red-500'

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>

      {/* Loading state */}
      {loading && (
        <>
          <div className="rounded-xl border bg-card p-5 animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-4/5" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard className="h-40" />
        </>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <>
          {/* Post preview card */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {data.post.platforms.map((p) => (
                <span
                  key={p}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {PLATFORM_ICONS[p] ?? ''} {p.charAt(0) + p.slice(1).toLowerCase()}
                </span>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {format(new Date(data.post.scheduledFor), 'MMM d, yyyy · h:mm a')}
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              {data.post.content.length > 300
                ? data.post.content.slice(0, 300) + '…'
                : data.post.content}
            </p>
          </div>

          {/* No metrics empty state */}
          {data.metrics.length === 0 && (
            <div className="rounded-xl border bg-card p-10 text-center space-y-2">
              <div className="text-4xl">📊</div>
              <p className="font-medium">No metrics recorded yet.</p>
              <p className="text-sm text-muted-foreground">
                Analytics sync runs automatically after publishing.
              </p>
            </div>
          )}

          {/* Total Engagement Stats */}
          {data.metrics.length > 0 && (
            <>
              <div>
                <h2 className="text-base font-semibold mb-3">Total Engagement</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: '👍', label: 'Likes', value: data.totals.likes },
                    { icon: '💬', label: 'Comments', value: data.totals.comments },
                    { icon: '🔄', label: 'Shares', value: data.totals.shares },
                    { icon: '👁️', label: 'Reach', value: data.totals.reach },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="rounded-xl border bg-card p-4 space-y-1">
                      <p className="text-2xl">{icon}</p>
                      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-Platform Breakdown */}
              <div>
                <h2 className="text-base font-semibold mb-3">Per-Platform Breakdown</h2>
                <div className="space-y-3">
                  {data.metrics.map((m) => {
                    const total = m.likes + m.comments + m.shares + m.reach
                    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
                    return (
                      <div key={m.platform} className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{PLATFORM_ICONS[m.platform] ?? '📡'}</span>
                          <span className="font-medium text-sm">
                            {m.platform.charAt(0) + m.platform.slice(1).toLowerCase()}
                          </span>
                        </div>
                        {/* Horizontal bar */}
                        <div className="flex h-3 rounded-full overflow-hidden w-full bg-muted">
                          <div
                            style={{ width: `${pct(m.likes)}%` }}
                            className="bg-blue-400 transition-all"
                            title={`Likes: ${m.likes}`}
                          />
                          <div
                            style={{ width: `${pct(m.comments)}%` }}
                            className="bg-violet-400 transition-all"
                            title={`Comments: ${m.comments}`}
                          />
                          <div
                            style={{ width: `${pct(m.shares)}%` }}
                            className="bg-green-400 transition-all"
                            title={`Shares: ${m.shares}`}
                          />
                          <div
                            style={{ width: `${pct(m.reach)}%` }}
                            className="bg-orange-300 transition-all"
                            title={`Reach: ${m.reach}`}
                          />
                        </div>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-400 mr-1" />👍 {m.likes.toLocaleString()} likes</span>
                          <span><span className="inline-block w-2 h-2 rounded-sm bg-violet-400 mr-1" />💬 {m.comments.toLocaleString()} comments</span>
                          <span><span className="inline-block w-2 h-2 rounded-sm bg-green-400 mr-1" />🔄 {m.shares.toLocaleString()} shares</span>
                          <span><span className="inline-block w-2 h-2 rounded-sm bg-orange-300 mr-1" />👁️ {m.reach.toLocaleString()} reach</span>
                          {m.impressions > 0 && (
                            <span>📣 {m.impressions.toLocaleString()} impressions</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Engagement Rate */}
              <div className="rounded-xl border bg-card p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Engagement Rate</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    (likes + comments + shares) ÷ reach × 100
                  </p>
                </div>
                <p className={cn('text-3xl font-bold', engagementColor)}>
                  {data.totals.engagement.toFixed(2)}%
                </p>
              </div>
            </>
          )}

          {/* Team Comments */}
          <div>
            <h2 className="text-base font-semibold mb-3">
              Team Comments
              {data.commentCount > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({data.commentCount})
                </span>
              )}
            </h2>
            {data.comments.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                No team comments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {data.comments.map((c) => (
                  <div key={c.id} className="rounded-xl border bg-card p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{c.userEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.createdAt), 'MMM d, yyyy · h:mm a')}
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
