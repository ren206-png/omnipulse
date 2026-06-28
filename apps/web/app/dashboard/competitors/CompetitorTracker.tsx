'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'

interface CompetitorSnapshot {
  id: string
  followers: number
  estimatedEngagement: number
  recordedAt: string
}

interface CompetitorAccount {
  id: string
  platform: string
  handle: string
  displayName: string | null
  snapshots: CompetitorSnapshot[]
  createdAt: string
}

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'X', 'TIKTOK']

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: 'bg-pink-500 text-white',
  FACEBOOK: 'bg-blue-600 text-white',
  X: 'bg-black text-white',
  TIKTOK: 'bg-slate-900 text-white',
}

function Sparkline({ snapshots }: { snapshots: CompetitorSnapshot[] }) {
  const points = [...snapshots].reverse().slice(-5)
  if (points.length < 2) {
    return <div className="text-xs text-muted-foreground">Not enough data</div>
  }
  const values = points.map((s) => s.followers)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100
    const y = 40 - ((v - min) / range) * 30
    return `${x},${y}`
  })
  const pathD = `M ${coords.join(' L ')}`
  const isGrowing = values[values.length - 1] >= values[0]
  return (
    <svg viewBox="0 0 100 40" className="w-24 h-8" preserveAspectRatio="none">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={isGrowing ? '#22c55e' : '#ef4444'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CompetitorTracker() {
  const { activeWorkspace } = useWorkspace()
  const [competitors, setCompetitors] = useState<CompetitorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState('INSTAGRAM')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [refreshLoading, setRefreshLoading] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  function getToken() {
    if (typeof document === 'undefined') return ''
    const match = document.cookie.match(/token=([^;]+)/)
    return match ? match[1] : ''
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchCompetitors = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch(`${apiUrl}/api/v1/competitors?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setError('Failed to load competitors'); return }
      const data = (await res.json()) as { competitors: CompetitorAccount[] }
      setCompetitors(data.competitors)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, apiUrl])

  useEffect(() => { fetchCompetitors() }, [fetchCompetitors])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!activeWorkspace || !handle.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      const token = getToken()
      const res = await fetch(`${apiUrl}/api/v1/competitors`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, platform, handle: handle.trim(), displayName: displayName.trim() || handle.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setAddError(body.error ?? 'Failed to add competitor')
        return
      }
      setHandle('')
      setDisplayName('')
      showToast('Competitor added!')
      fetchCompetitors()
    } catch {
      setAddError('Network error')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRefresh(id: string) {
    setRefreshLoading(id)
    try {
      const token = getToken()
      const res = await fetch(`${apiUrl}/api/v1/competitors/${id}/snapshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Refresh failed'); return }
      showToast('Data refreshed!')
      fetchCompetitors()
    } catch {
      showToast('Network error')
    } finally {
      setRefreshLoading(null)
    }
  }

  async function handleRemove(id: string) {
    setRemoveLoading(id)
    try {
      const token = getToken()
      const res = await fetch(`${apiUrl}/api/v1/competitors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Remove failed'); return }
      setCompetitors((prev) => prev.filter((c) => c.id !== id))
      showToast('Removed')
    } catch {
      showToast('Network error')
    } finally {
      setRemoveLoading(null)
    }
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to track competitors.</p>
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Add Competitor Form */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-base">Track a Competitor</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-36">
            <label className="text-xs text-muted-foreground">Handle</label>
            <input
              type="text"
              placeholder="@username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>
          <div className="space-y-1 flex-1 min-w-36">
            <label className="text-xs text-muted-foreground">Display Name (optional)</label>
            <input
              type="text"
              placeholder="Brand Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button type="submit" disabled={addLoading || !handle.trim()} className="h-9">
            {addLoading ? 'Adding…' : '+ Add Competitor'}
          </Button>
        </form>
        {addError && <p className="text-xs text-destructive">{addError}</p>}
      </div>

      {/* Competitor list */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && competitors.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <p className="font-semibold text-lg">No competitors tracked yet</p>
          <p className="text-sm text-muted-foreground">Track your competitors to benchmark your growth</p>
        </div>
      )}

      {!loading && !error && competitors.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {competitors.map((comp) => {
            const latest = comp.snapshots[0]
            const prev = comp.snapshots[1]
            const followerDiff = latest && prev ? latest.followers - prev.followers : 0
            const trend = followerDiff > 0 ? '↑' : followerDiff < 0 ? '↓' : '→'
            const trendColor = followerDiff > 0 ? 'text-green-600' : followerDiff < 0 ? 'text-red-500' : 'text-muted-foreground'
            return (
              <div key={comp.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLATFORM_COLORS[comp.platform] ?? 'bg-muted text-foreground'}`}>
                      {comp.platform}
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{comp.displayName ?? comp.handle}</p>
                      <p className="text-xs text-muted-foreground">@{comp.handle}</p>
                    </div>
                  </div>
                  <Sparkline snapshots={comp.snapshots} />
                </div>

                {latest ? (
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Followers</p>
                      <p className="font-semibold">
                        {latest.followers.toLocaleString()}
                        <span className={`ml-1 text-xs ${trendColor}`}>{trend}</span>
                        {followerDiff !== 0 && (
                          <span className={`ml-0.5 text-xs ${trendColor}`}>
                            {Math.abs(followerDiff).toLocaleString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Engagement</p>
                      <p className="font-semibold">{latest.estimatedEngagement.toFixed(2)}%</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No snapshot data yet</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleRefresh(comp.id)}
                    disabled={refreshLoading === comp.id}
                  >
                    {refreshLoading === comp.id ? 'Refreshing…' : 'Refresh'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
                    onClick={() => handleRemove(comp.id)}
                    disabled={removeLoading === comp.id}
                  >
                    {removeLoading === comp.id ? 'Removing…' : 'Remove'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
