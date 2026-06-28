'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from './context/WorkspaceContext'

const PLATFORM_ICONS: Record<string, string> = {
  INSTAGRAM: '📸',
  FACEBOOK: '👤',
  X: '🐦',
  TIKTOK: '🎵',
  GOOGLE: '▶️',
  LINKEDIN: '💼',
  PINTEREST: '📌',
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

interface HourScore { hour: number; score: number; label: string; isRecommended: boolean }
interface PlatformRecommendation {
  platform: string
  topHours: number[]
  heatmap: HourScore[]
  dataSource: 'workspace' | 'benchmark'
  postsAnalyzed: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function BestTimesWidget({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [recommendations, setRecommendations] = useState<PlatformRecommendation[]>([])
  const [selected, setSelected] = useState<string>('INSTAGRAM')
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async (workspaceId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/analytics/best-times?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { recommendations: PlatformRecommendation[] }
      setRecommendations(data.recommendations)
      if (data.recommendations.length > 0) setSelected(data.recommendations[0].platform)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (activeWorkspace?.id) fetch_(activeWorkspace.id)
  }, [activeWorkspace?.id, fetch_])

  const current = recommendations.find((r) => r.platform === selected)

  if (loading) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6 space-y-3 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-3 w-64 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  if (recommendations.length === 0) return null

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Best Times to Post</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {current?.dataSource === 'workspace'
              ? `Based on your ${current.postsAnalyzed} published posts`
              : 'Industry benchmarks — post more to personalise'}
          </p>
        </div>
        {current?.dataSource === 'workspace' && (
          <span className="text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
            Your data
          </span>
        )}
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 overflow-x-auto scrollbar-none">
        {recommendations.map((r) => (
          <button
            key={r.platform}
            onClick={() => setSelected(r.platform)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              selected === r.platform
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {PLATFORM_ICONS[r.platform] ?? '📱'} {r.platform.charAt(0) + r.platform.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {current && (
        <div className="p-5 space-y-4">
          {/* Top recommended times */}
          <div className="flex gap-2 flex-wrap">
            {current.topHours.map((h) => (
              <div
                key={h}
                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
              >
                ⏰ {formatHour(h)}
              </div>
            ))}
          </div>

          {/* 24-hour heatmap */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Activity heatmap (UTC)</p>
            <div className="flex gap-0.5 items-end h-12">
              {current.heatmap.map((h) => (
                <div
                  key={h.hour}
                  className="flex-1 min-w-0 group relative"
                  title={`${h.label}: ${h.score}%`}
                >
                  <div
                    className={`w-full rounded-sm transition-all ${
                      h.isRecommended ? 'bg-primary' : 'bg-muted'
                    }`}
                    style={{ height: `${Math.max(4, h.score)}%` }}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border rounded px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-sm">
                    {h.label}
                  </div>
                </div>
              ))}
            </div>
            {/* Hour labels — show every 6 hours */}
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
