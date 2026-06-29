'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: '#e1306c',
  FACEBOOK: '#1877f2',
  X: '#000000',
  TIKTOK: '#010101',
  GOOGLE: '#ea4335',
  LINKEDIN: '#0A66C2',
}

const PLATFORM_EMOJI: Record<string, string> = {
  INSTAGRAM: '📸', FACEBOOK: '👤', X: '🐦', TIKTOK: '🎵', GOOGLE: '▶️', LINKEDIN: '💼',
}

type Insights = {
  period: { days: number; since: string }
  summary: { totalPosts: number; totalLikes: number; totalComments: number; totalShares: number; totalReach: number }
  platformBreakdown: { platform: string; posts: number; likes: number; comments: number; shares: number; reach: number }[]
  contentLength: { label: string; count: number; avgEngagement: number }[]
  topPosts: { id: string; content: string; platforms: string[]; scheduledFor: string; engagement: number; reach: number }[]
  postTrend: { date: string; count: number }[]
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color ?? 'hsl(var(--primary))' }}
        />
      </div>
    </div>
  )
}

export function InsightsClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [error, setError] = useState<string | null>(null)

  const fetchInsights = useCallback(async (workspaceId: string, d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/insights?workspaceId=${workspaceId}&days=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setError('Failed to load insights'); return }
      const data = await res.json() as Insights
      setInsights(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (activeWorkspace?.id) fetchInsights(activeWorkspace.id, days)
  }, [activeWorkspace?.id, days, fetchInsights])

  const maxEngagement = insights
    ? Math.max(...insights.platformBreakdown.map((p) => p.likes + p.comments + p.shares), 1)
    : 1
  const maxLengthEngagement = insights
    ? Math.max(...insights.contentLength.map((b) => b.avgEngagement), 1)
    : 1

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Content Insights</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance breakdown for your published posts.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Last</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-center text-sm text-destructive">{error}</div>
      ) : insights ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Posts published" value={insights.summary.totalPosts} sub={`last ${days} days`} />
            <StatCard label="Total likes" value={insights.summary.totalLikes} />
            <StatCard label="Total comments" value={insights.summary.totalComments} />
            <StatCard label="Total shares" value={insights.summary.totalShares} />
            <StatCard label="Total reach" value={insights.summary.totalReach} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Platform breakdown */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Engagement by platform</h2>
              {insights.platformBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground">No published posts in this period.</p>
              ) : (
                <div className="space-y-3">
                  {insights.platformBreakdown
                    .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
                    .map((p) => (
                      <BarRow
                        key={p.platform}
                        label={`${PLATFORM_EMOJI[p.platform] ?? ''} ${p.platform.charAt(0) + p.platform.slice(1).toLowerCase()} (${p.posts} posts)`}
                        value={p.likes + p.comments + p.shares}
                        max={maxEngagement}
                        color={PLATFORM_COLORS[p.platform]}
                      />
                    ))}
                </div>
              )}
            </div>

            {/* Content length performance */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Avg engagement by content length</h2>
              {insights.contentLength.every((b) => b.count === 0) ? (
                <p className="text-xs text-muted-foreground">No published posts in this period.</p>
              ) : (
                <div className="space-y-3">
                  {insights.contentLength.map((b) => (
                    <BarRow
                      key={b.label}
                      label={`${b.label} — ${b.count} post${b.count !== 1 ? 's' : ''}`}
                      value={b.avgEngagement}
                      max={maxLengthEngagement}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top posts */}
          {insights.topPosts.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="text-sm font-semibold">Top performing posts</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Ranked by total engagement (likes + comments + shares).</p>
              </div>
              <div className="divide-y">
                {insights.topPosts.map((post, idx) => (
                  <div key={post.id} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{post.platforms.map((p) => PLATFORM_EMOJI[p] ?? p).join(' ')}</span>
                        <span>{new Date(post.scheduledFor).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold">{post.engagement.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">eng.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Post frequency trend */}
          {insights.postTrend.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold">Posting frequency</h2>
              <div className="flex items-end gap-1 h-20">
                {(() => {
                  const maxCount = Math.max(...insights.postTrend.map((d) => d.count), 1)
                  return insights.postTrend.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.count} post${d.count !== 1 ? 's' : ''}`}
                      className="flex-1 rounded-sm bg-primary/70 hover:bg-primary transition-colors min-h-[4px]"
                      style={{ height: `${Math.max(4, (d.count / maxCount) * 80)}px` }}
                    />
                  ))
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                {insights.postTrend.length} active days · {insights.summary.totalPosts} total posts
              </p>
            </div>
          )}

          {insights.summary.totalPosts === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <p className="text-sm font-medium">No published posts in the last {days} days</p>
              <p className="text-xs text-muted-foreground mt-1">
                Insights will appear here once posts are published to your connected accounts.
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
