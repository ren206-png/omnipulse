'use client'
import { useState, useEffect } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

interface HashtagStat {
  tag: string
  uses: number
  avgEngagement: number
  avgReach: number
  totalEngagement: number
}

const MEDALS = ['🥇', '🥈', '🥉']

export function HashtagPerformance({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [data, setData] = useState<{ hashtags: HashtagStat[]; postsAnalyzed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/analytics/hashtag-performance?workspaceId=${activeWorkspace.id}&days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { hashtags: HashtagStat[]; postsAnalyzed: number }) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeWorkspace?.id, token, days])

  const maxEngagement = Math.max(...(data?.hashtags.map(h => h.avgEngagement) ?? [1]), 1)

  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Your Top Hashtags 📈</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data
              ? `Analysed across ${data.postsAnalyzed} published post${data.postsAnalyzed !== 1 ? 's' : ''}`
              : 'Analysing your published posts…'}
          </p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${days === d ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-9 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !data?.hashtags.length ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-4xl">#️⃣</p>
          <p className="font-medium text-sm">No hashtag data yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Start adding hashtags to your posts and publishing them — performance data will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.hashtags.slice(0, 15).map((h, i) => (
            <div key={h.tag} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span>{MEDALS[i] ?? ''}</span>
                  <span className="font-mono font-semibold text-primary">{h.tag}</span>
                  <span className="text-muted-foreground">{h.uses}× used</span>
                </div>
                <span className="font-semibold tabular-nums">{h.avgEngagement} avg</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${(h.avgEngagement / maxEngagement) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!!data?.hashtags.length && (
        <p className="text-[10px] text-muted-foreground border-t pt-3">
          💡 Avg. engagement is distributed across hashtags used in the same post — higher means that hashtag correlates with better-performing content.
        </p>
      )}
    </div>
  )
}
