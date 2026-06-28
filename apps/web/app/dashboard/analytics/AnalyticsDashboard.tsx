'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReportsPanel } from './ReportsPanel'

interface HourScore {
  hour: number
  score: number
  label: string
  isRecommended: boolean
}

interface PlatformRecommendation {
  platform: string
  topHours: number[]
  heatmap: HourScore[]
  dataSource: 'workspace' | 'benchmark'
  postsAnalyzed: number
}

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: '#e1306c',
  FACEBOOK: '#1877f2',
  X: '#000000',
  TIKTOK: '#69c9d0',
  GOOGLE: '#4285f4',
}

function BestTimesSection({ workspaceId, token }: { workspaceId: string; token: string }) {
  const [recs, setRecs] = useState<PlatformRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [activePlatform, setActivePlatform] = useState('')

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/analytics/best-times?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { recommendations: PlatformRecommendation[] }) => {
        setRecs(data.recommendations ?? [])
        if (data.recommendations?.length) setActivePlatform(data.recommendations[0].platform)
      })
      .catch(() => {/* silent */})
      .finally(() => setLoading(false))
  }, [workspaceId, token])

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border bg-card shadow-sm p-6 space-y-4">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-24 bg-muted/50 rounded-lg" />
      </div>
    )
  }

  const active = recs.find((r) => r.platform === activePlatform)
  const color = PLATFORM_COLORS[activePlatform] ?? '#3b82f6'

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Best Times to Post</h2>
      <div className="rounded-xl border bg-card shadow-sm p-6 space-y-5">
        {/* Platform tabs */}
        <div className="flex flex-wrap gap-2">
          {recs.map((r) => (
            <button
              key={r.platform}
              onClick={() => setActivePlatform(r.platform)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                r.platform === activePlatform
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground hover:text-foreground border-border',
              )}
            >
              {r.platform.charAt(0) + r.platform.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {active && (
          <>
            {/* Data source badge */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'px-2 py-0.5 rounded-full border font-medium',
                active.dataSource === 'workspace'
                  ? 'border-green-500/30 text-green-600 bg-green-50 dark:bg-green-950/30'
                  : 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/30',
              )}>
                {active.dataSource === 'workspace' ? 'Your data' : 'Industry benchmark'}
              </span>
              {active.postsAnalyzed > 0 && (
                <span>{active.postsAnalyzed} post{active.postsAnalyzed !== 1 ? 's' : ''} analyzed</span>
              )}
            </div>

            {/* Top hours */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Top times</p>
              <div className="flex gap-2 flex-wrap">
                {active.topHours.map((h) => {
                  const score = active.heatmap[h]
                  return (
                    <div key={h} className="px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary">
                      {score?.label ?? `${h}:00`}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 24h heatmap */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">24-hour engagement heatmap</p>
              <div className="flex gap-0.5 items-end h-16">
                {active.heatmap.map((slot) => (
                  <div key={slot.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div
                      className="w-full rounded-sm transition-opacity"
                      style={{
                        height: `${Math.max(4, slot.score)}%`,
                        backgroundColor: color,
                        opacity: slot.isRecommended ? 1 : 0.25,
                      }}
                    />
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                      <div className="bg-popover border rounded-md shadow-md px-2 py-1 text-xs text-nowrap">
                        <span className="font-medium">{slot.label}</span>
                        <span className="text-muted-foreground ml-1">· {slot.score}</span>
                      </div>
                      <div className="w-1.5 h-1.5 rotate-45 bg-popover border-b border-r mt-[-4px]" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Hour labels — every 6 hours */}
              <div className="relative flex mt-1 h-4">
                {[0, 6, 12, 18].map((h) => {
                  const label = h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`
                  return (
                    <span
                      key={h}
                      className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                      style={{ left: `${(h / 24) * 100}%` }}
                    >
                      {label}
                    </span>
                  )
                })}
                <span className="absolute right-0 text-[10px] text-muted-foreground">12am</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface Snapshot {
  id: string
  followers: number
  impressions: number
  engagementRate: number
  recordedAt: string
}

interface AccountData {
  socialAccountId: string
  platform: string
  externalProfileId: string
  snapshots: Snapshot[]
}

interface Props {
  workspaceId: string
  token: string
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="h-4 w-40 bg-muted rounded" />
      <div className="h-[300px] bg-muted/50 rounded-lg" />
    </div>
  )
}

const chartAxisStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' }

function ChartTooltip({
  active,
  payload,
  label,
  valueKey,
  formatter,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  valueKey: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value ?? 0
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-sm space-y-1 min-w-[160px]">
      <p className="font-medium">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{valueKey}</span>
        <span className="font-medium">{formatter ? formatter(val) : val.toLocaleString()}</span>
      </div>
    </div>
  )
}

export function AnalyticsDashboard({ workspaceId, token }: Props) {
  const [accounts, setAccounts] = useState<AccountData[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/analytics?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { data: AccountData[] }
      setAccounts(data.data)
      if (data.data.length > 0) setSelectedAccountId(data.data[0].socialAccountId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  async function handleSyncNow() {
    setSyncing(true)
    setSyncMsg(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/analytics/sync?workspaceId=${workspaceId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      setSyncMsg('Sync started — data will update shortly.')
      // Refresh after a short delay to pick up any fast responses
      setTimeout(() => { fetchAnalytics() }, 3000)
    } catch {
      setSyncMsg('Sync request failed.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-9 w-64 bg-muted rounded-md" />
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
        <span>Failed to load analytics: {error}</span>
        <Button variant="ghost" size="sm" onClick={fetchAnalytics}>Retry</Button>
      </div>
    )
  }

  const activeAccount = accounts.find((a) => a.socialAccountId === selectedAccountId)
  const snapshots = activeAccount?.snapshots ?? []

  const chartData = snapshots.map((s) => ({
    date: format(new Date(s.recordedAt), 'MMM d'),
    Followers: s.followers ?? 0,
    Impressions: s.impressions ?? 0,
    'Engagement %': s.engagementRate != null ? Number((s.engagementRate * 100).toFixed(2)) : 0,
  }))

  return (
    <div className="space-y-6">
      {/* Sync Now */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track follower growth, impressions, and engagement across platforms.</p>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-sm text-muted-foreground">{syncMsg}</span>}
          <Button size="sm" variant="outline" onClick={handleSyncNow} disabled={syncing}>
            {syncing ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Syncing…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Sync Now
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Best Times — always visible regardless of account data */}
      <BestTimesSection workspaceId={workspaceId} token={token} />

      {/* No accounts state for chart section only */}
      {accounts.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed h-40">
          <p className="text-sm text-muted-foreground text-center">
            No analytics snapshot data yet.<br />
            Connect social accounts and run a sync to see charts here.
          </p>
        </div>
      )}

      {/* Account filter */}
      {accounts.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Account:</span>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.socialAccountId} value={a.socialAccountId}>
                  {a.platform} — {a.externalProfileId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Follower Growth */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Follower Growth</h2>
        <div className="rounded-xl border bg-card shadow-sm p-6">
          {snapshots.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">No snapshot data for this account.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTooltip valueKey="Followers" />} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Area
                  type="monotone"
                  dataKey="Followers"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#followerGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Impressions */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Impressions</h2>
        <div className="rounded-xl border bg-card shadow-sm p-6">
          {snapshots.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">No snapshot data for this account.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={chartAxisStyle} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTooltip valueKey="Impressions" />} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Line
                  type="monotone"
                  dataKey="Impressions"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Engagement Rate */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Engagement Rate</h2>
        <div className="rounded-xl border bg-card shadow-sm p-6">
          {snapshots.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">No snapshot data for this account.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={chartAxisStyle} tickLine={false} axisLine={false} />
                <YAxis
                  tick={chartAxisStyle}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueKey="Engagement"
                      formatter={(v) => `${v}%`}
                    />
                  }
                  cursor={{ stroke: 'hsl(var(--border))' }}
                />
                <Line
                  type="monotone"
                  dataKey="Engagement %"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Posts */}
      <TopPostsSection workspaceId={workspaceId} token={token} />

      {/* Shareable Reports */}
      <ReportsPanel workspaceId={workspaceId} token={token} />
    </div>
  )
}

interface TopPost {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string
  totalEngagement: number
  totalReach: number
  metrics: { platform: string; likes: number; comments: number; shares: number; reach: number }[]
}

function TopPostsSection({ workspaceId, token }: { workspaceId: string; token: string }) {
  const [posts, setPosts] = useState<TopPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/analytics/top-posts?workspaceId=${workspaceId}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { posts?: TopPost[] }) => setPosts(data.posts ?? []))
      .catch(() => {/* silent */})
      .finally(() => setLoading(false))
  }, [workspaceId, token])

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border bg-card shadow-sm p-6 space-y-3">
        <div className="h-4 w-32 bg-muted rounded" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted/50 rounded" />)}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Top Posts</h2>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {posts.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground text-center">
              No published posts yet.<br />
              Engagement data will appear here after posts go live.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Post</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Likes</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Comments</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Shares</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Reach</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {posts.map((p) => {
                const likes    = p.metrics.reduce((s, m) => s + m.likes, 0)
                const comments = p.metrics.reduce((s, m) => s + m.comments, 0)
                const shares   = p.metrics.reduce((s, m) => s + m.shares, 0)
                const reach    = p.metrics.reduce((s, m) => s + m.reach, 0)
                const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate font-medium text-xs">{p.content}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(p.scheduledFor), 'MMM d, yyyy')}
                        </span>
                        <div className="flex gap-1">
                          {p.platforms.map((pl) => (
                            <span key={pl} className="text-[10px] bg-muted px-1 rounded">{pl}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(likes)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(comments)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(shares)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{fmt(reach)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
