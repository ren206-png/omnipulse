'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useWorkspace } from './context/WorkspaceContext'
import { PostPerformanceChart } from './PostPerformanceChart'
import { startOfMonth, endOfMonth, isWithinInterval, format, formatDistanceToNow } from 'date-fns'

interface PostMetric {
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
  scheduledFor: string
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'PENDING_REVIEW'
  createdAt: string
  metrics: PostMetric[]
}

interface WorkspaceWithCount {
  id: string
  name: string
  _count: { posts: number; socialAccounts: number }
}

const PLATFORM_ICONS: Record<string, string> = {
  TWITTER: '🐦',
  INSTAGRAM: '📸',
  LINKEDIN: '💼',
  FACEBOOK: '👤',
  TIKTOK: '🎵',
  PINTEREST: '📌',
  YOUTUBE: '▶️',
}

function MetricSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card shadow-sm p-6 space-y-3">
      <div className="h-3 w-32 bg-muted rounded" />
      <div className="h-8 w-16 bg-muted rounded" />
      <div className="h-3 w-24 bg-muted rounded" />
    </div>
  )
}

function MetricCard({
  title,
  value,
  description,
  accent,
}: {
  title: string
  value: string | number
  description: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className={`text-3xl font-bold ${accent ?? ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

function PostRow({ post }: { post: Post }) {
  const totalEngagement = post.metrics.reduce(
    (sum, m) => sum + m.likes + m.comments + m.shares,
    0,
  )
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="flex gap-1 pt-0.5">
        {post.platforms.slice(0, 3).map((p) => (
          <span key={p} title={p} className="text-base leading-none">
            {PLATFORM_ICONS[p] ?? '🌐'}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground line-clamp-2">{post.content}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {post.status === 'PUBLISHED'
            ? `Published ${formatDistanceToNow(new Date(post.scheduledFor), { addSuffix: true })}`
            : `Scheduled for ${format(new Date(post.scheduledFor), 'MMM d, h:mm a')}`}
        </p>
      </div>
      {post.status === 'PUBLISHED' && totalEngagement > 0 && (
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{totalEngagement.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">engagements</p>
        </div>
      )}
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          post.status === 'PUBLISHED'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : post.status === 'SCHEDULED'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : post.status === 'FAILED'
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        }`}
      >
        {post.status === 'PENDING_REVIEW' ? 'Review' : post.status.charAt(0) + post.status.slice(1).toLowerCase()}
      </span>
    </div>
  )
}

export function DashboardContent({ token }: { token: string }) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [posts, setPosts] = useState<Post[]>([])
  const [activeSocialAccounts, setActiveSocialAccounts] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(
    async (workspaceId: string) => {
      setLoading(true)
      setError(null)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const [workspacesRes, postsRes] = await Promise.all([
          fetch(`${apiUrl}/api/v1/workspaces`, { headers }),
          fetch(`${apiUrl}/api/v1/posts?workspaceId=${workspaceId}`, { headers }),
        ])
        if (!workspacesRes.ok) throw new Error(`Workspaces API ${workspacesRes.status}`)
        if (!postsRes.ok) throw new Error(`Posts API ${postsRes.status}`)

        const { workspaces } = (await workspacesRes.json()) as { workspaces: WorkspaceWithCount[] }
        const { posts: fetchedPosts } = (await postsRes.json()) as { posts: Post[] }

        const ws = workspaces.find((w) => w.id === workspaceId)
        setActiveSocialAccounts(ws?._count.socialAccounts ?? 0)
        setPosts(fetchedPosts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    if (activeWorkspace) fetchData(activeWorkspace.id)
  }, [activeWorkspace, fetchData])

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
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Select a workspace from the sidebar to view metrics.
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load dashboard data: {error}
      </div>
    )
  }

  const now = new Date()
  const monthInterval = { start: startOfMonth(now), end: endOfMonth(now) }
  const totalScheduled = posts.filter((p) => p.status === 'SCHEDULED').length
  const publishedThisMonth = posts.filter(
    (p) =>
      p.status === 'PUBLISHED' &&
      isWithinInterval(new Date(p.scheduledFor), monthInterval),
  ).length
  const totalEngagement = posts.reduce(
    (sum, p) => sum + p.metrics.reduce((s, m) => s + m.likes + m.comments + m.shares, 0),
    0,
  )

  // Sort: upcoming scheduled (soonest first), then recent published (newest first)
  const upcomingPosts = posts
    .filter((p) => p.status === 'SCHEDULED' || p.status === 'PENDING_REVIEW')
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    .slice(0, 5)

  const recentPublished = posts
    .filter((p) => p.status === 'PUBLISHED')
    .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime())
    .slice(0, 5)

  return (
    <>
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
            <MetricSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              title="Scheduled"
              value={totalScheduled}
              description="Awaiting publication"
            />
            <MetricCard
              title="Published This Month"
              value={publishedThisMonth}
              description={now.toLocaleString('default', { month: 'long', year: 'numeric' })}
              accent="text-green-600 dark:text-green-400"
            />
            <MetricCard
              title="Active Accounts"
              value={activeSocialAccounts}
              description="Connected in this workspace"
            />
            <MetricCard
              title="Total Engagement"
              value={totalEngagement}
              description="Likes + comments + shares"
              accent="text-blue-600 dark:text-blue-400"
            />
          </>
        )}
      </div>

      {/* Onboarding prompt */}
      {!loading && posts.length === 0 && activeSocialAccounts === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-8 flex flex-col items-center text-center gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">You&apos;re all set — let&apos;s get started</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Connect a social account and schedule your first post to start seeing data here.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <Link
              href="/dashboard/accounts"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Connect an account
            </Link>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Schedule a post
            </Link>
          </div>
        </div>
      )}

      {/* Two-column feed */}
      {!loading && posts.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Upcoming posts */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">Upcoming Posts</h2>
              <Link
                href="/dashboard/calendar"
                className="text-xs text-primary hover:underline"
              >
                View calendar →
              </Link>
            </div>
            <div className="px-5">
              {upcomingPosts.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground text-center">
                  No scheduled posts yet.{' '}
                  <Link href="/dashboard/calendar" className="text-primary hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                upcomingPosts.map((p) => <PostRow key={p.id} post={p} />)
              )}
            </div>
          </div>

          {/* Recent published */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">Recently Published</h2>
              <Link
                href="/dashboard/analytics"
                className="text-xs text-primary hover:underline"
              >
                View analytics →
              </Link>
            </div>
            <div className="px-5">
              {recentPublished.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground text-center">
                  No published posts yet.
                </p>
              ) : (
                recentPublished.map((p) => <PostRow key={p.id} post={p} />)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance chart */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Post Performance</h2>
          <Link href="/dashboard/analytics" className="text-xs text-primary hover:underline">
            Full analytics →
          </Link>
        </div>
        <div className="rounded-xl border bg-card shadow-sm p-6">
          {loading ? (
            <div className="animate-pulse flex items-center justify-center rounded-lg bg-muted/50 h-64" />
          ) : (
            <PostPerformanceChart posts={posts as Parameters<typeof PostPerformanceChart>[0]['posts']} />
          )}
        </div>
      </div>
    </>
  )
}
