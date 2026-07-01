'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../context/WorkspaceContext'

interface PostMetric {
  platform: string
  likes: number
  comments: number
  shares: number
}

interface HealthPost {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string
  daysSincePublished: number
  totalEngagement: number
  healthScore: number
  status: 'healthy' | 'aging' | 'repurpose'
  metrics: PostMetric[]
}

type FilterTab = 'all' | 'healthy' | 'aging' | 'repurpose'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

function SkeletonCard() {
  return (
    <div className="bg-card border rounded-xl p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-3 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-2 bg-muted rounded w-full mt-2" />
      <div className="flex gap-2 mt-3">
        <div className="h-7 bg-muted rounded w-20" />
        <div className="h-7 bg-muted rounded w-16" />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: HealthPost['status'] }) {
  if (status === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        ✅ Healthy
      </span>
    )
  }
  if (status === 'aging') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
        ⚠️ Aging
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
      🔄 Needs Repurposing
    </span>
  )
}

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 60
      ? 'bg-green-500'
      : score >= 25
      ? 'bg-yellow-400'
      : 'bg-red-500'

  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  )
}

function PostCard({ post }: { post: HealthPost }) {
  const truncated = post.content.length > 120 ? post.content.slice(0, 120) + '…' : post.content

  return (
    <div className="bg-card border rounded-xl p-5 space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-foreground leading-relaxed flex-1">{truncated}</p>
        <StatusBadge status={post.status} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {post.platforms.map((p) => (
          <span
            key={p}
            className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium"
          >
            {p}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>📅 {post.daysSincePublished}d ago</span>
        <span>💬 {post.totalEngagement} engagements</span>
        <span>Score: {post.healthScore}/100</span>
      </div>

      <HealthBar score={post.healthScore} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2 flex-wrap">
          {post.metrics.map((m) => (
            <span key={m.platform} className="text-xs text-muted-foreground">
              {m.platform}: {m.likes}♥ {m.comments}💬 {m.shares}🔁
            </span>
          ))}
        </div>
        <Link
          href={`/dashboard/history?repurpose=${post.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Repurpose ✨
        </Link>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: 'green' | 'yellow' | 'red'
}) {
  const styles = {
    green: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-300',
    red: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300',
  }
  return (
    <div className={`border rounded-xl p-5 ${styles[color]}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
    </div>
  )
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'aging', label: 'Aging' },
  { key: 'repurpose', label: 'Needs Repurposing' },
]

export function ContentHealthClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [posts, setPosts] = useState<HealthPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  useEffect(() => {
    if (!activeWorkspace?.id) return

    setLoading(true)
    setError(null)

    fetch(`${apiUrl}/api/v1/posts/content-health?workspaceId=${activeWorkspace.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string }
          throw new Error(body.error ?? 'Failed to load content health data')
        }
        return res.json() as Promise<{ posts: HealthPost[] }>
      })
      .then(({ posts }) => setPosts(posts))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeWorkspace?.id, token])

  const healthy = posts.filter((p) => p.status === 'healthy')
  const aging = posts.filter((p) => p.status === 'aging')
  const repurpose = posts.filter((p) => p.status === 'repurpose')

  const filtered =
    activeTab === 'all'
      ? posts
      : activeTab === 'healthy'
      ? healthy
      : activeTab === 'aging'
      ? aging
      : repurpose

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Health ❤️</h1>
        <p className="text-muted-foreground mt-1">
          Track how your published posts are performing over time. Repurpose aging content to maximize reach.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Healthy Posts" count={healthy.length} color="green" />
        <SummaryCard label="Aging Posts" count={aging.length} color="yellow" />
        <SummaryCard label="Needs Repurposing" count={repurpose.length} color="red" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="text-destructive font-medium">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No posts found</p>
          <p className="text-sm mt-1">
            {activeTab === 'all'
              ? 'No published posts in the last 90 days.'
              : `No ${activeTab} posts right now.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
