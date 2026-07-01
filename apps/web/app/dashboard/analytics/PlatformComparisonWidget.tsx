'use client'
import { useState, useEffect } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

interface PlatformStat {
  platform: string
  posts: number
  avgEngagement: number
  avgReach: number
  likes: number
  comments: number
  shares: number
  totalEngagement: number
}

const PLATFORM_COLORS: Record<string, string> = {
  LINKEDIN: '#0A66C2',
  INSTAGRAM: '#E1306C',
  FACEBOOK: '#1877F2',
  X: '#111111',
  TIKTOK: '#69C9D0',
  GOOGLE: '#4285F4',
}

export function PlatformComparisonWidget({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [data, setData] = useState<{ comparison: PlatformStat[]; insight: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/analytics/platform-comparison?workspaceId=${activeWorkspace.id}&days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { comparison: PlatformStat[]; insight: string }) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeWorkspace?.id, token, days])

  const maxEngagement = Math.max(...(data?.comparison.map((p) => p.avgEngagement) ?? [1]), 1)

  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Platform Performance</h3>
          <p className="text-xs text-muted-foreground">Avg. engagement per post</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${days === d ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : !data?.comparison.length ? (
        <div className="py-8 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm text-muted-foreground">Publish posts across multiple platforms to see comparison data here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.comparison.map((p, i) => (
            <div key={p.platform} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {i === 0 && <span title="Top platform">🏆</span>}
                  <span className="font-medium">{p.platform}</span>
                  <span className="text-muted-foreground">{p.posts} post{p.posts !== 1 ? 's' : ''}</span>
                </div>
                <span className="font-semibold tabular-nums">{p.avgEngagement} avg</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(p.avgEngagement / maxEngagement) * 100}%`, backgroundColor: PLATFORM_COLORS[p.platform] ?? '#6366f1' }} />
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span>❤️ {p.likes}</span><span>💬 {p.comments}</span><span>🔁 {p.shares}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.insight && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
          <p className="text-xs font-medium">💡 {data.insight}</p>
        </div>
      )}
    </div>
  )
}
