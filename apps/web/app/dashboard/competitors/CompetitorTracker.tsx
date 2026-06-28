'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'

interface CompetitorSnapshot {
  id: string
  followers: number
  estimatedEngagement: number
  source: string
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
  const points = [...snapshots].reverse().slice(-6)
  if (points.length < 2) return null
  const values = points.map((s) => s.followers)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100
    const y = 34 - ((v - min) / range) * 26
    return `${x},${y}`
  })
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

// ── Update Data modal ─────────────────────────────────────────────────────────
function UpdateModal({
  comp,
  onSave,
  onClose,
}: {
  comp: CompetitorAccount
  onSave: (followers: number, engagementRate: number) => Promise<void>
  onClose: () => void
}) {
  const latest = comp.snapshots[0]
  const [followers, setFollowers] = useState(latest ? String(latest.followers) : '')
  const [engagement, setEngagement] = useState(latest ? String(latest.estimatedEngagement) : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const f = parseFloat(followers)
    const e = parseFloat(engagement) || 0
    if (isNaN(f) || f < 0) return
    setSaving(true)
    await onSave(f, e)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-base">Update Competitor Data</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-medium">@{comp.handle}</span> · {comp.platform}
          </p>
        </div>

        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          📋 Look up the current stats on {comp.platform} and enter them below. Data you enter is saved as a real snapshot.
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Followers</label>
            <input
              type="number"
              min="0"
              step="1"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="e.g. 24500"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Engagement Rate % <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={engagement}
              onChange={(e) => setEngagement(e.target.value)}
              placeholder="e.g. 3.2"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Total interactions ÷ followers × 100</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !followers}>
            {saving ? 'Saving…' : 'Save Snapshot'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Add competitor modal ──────────────────────────────────────────────────────
function AddModal({
  onAdd,
  onClose,
}: {
  onAdd: (data: { platform: string; handle: string; displayName: string; followers: number | null; engagementRate: number | null }) => Promise<void>
  onClose: () => void
}) {
  const [platform, setPlatform] = useState('INSTAGRAM')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [followers, setFollowers] = useState('')
  const [engagement, setEngagement] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    setAdding(true)
    await onAdd({
      platform,
      handle: handle.trim(),
      displayName: displayName.trim() || handle.trim(),
      followers: followers ? parseFloat(followers) : null,
      engagementRate: engagement ? parseFloat(engagement) : null,
    })
    setAdding(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-base">Track a Competitor</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Add a social account to monitor over time.</p>
        </div>

        <form onSubmit={handleAdd} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Handle</label>
            <input
              type="text"
              placeholder="@username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Display Name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="Brand Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Optionally enter their current stats to start tracking immediately.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Current Followers</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 50000"
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Engagement %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 3.2"
                  value={engagement}
                  onChange={(e) => setEngagement(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={adding}>Cancel</Button>
            <Button type="submit" size="sm" disabled={adding || !handle.trim()}>
              {adding ? 'Adding…' : 'Add Competitor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function CompetitorTracker({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [competitors, setCompetitors] = useState<CompetitorAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [updateTarget, setUpdateTarget] = useState<CompetitorAccount | null>(null)
  const [removeLoading, setRemoveLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchCompetitors = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
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
  }, [activeWorkspace, apiUrl, token])

  useEffect(() => { fetchCompetitors() }, [fetchCompetitors])

  async function handleAdd(data: { platform: string; handle: string; displayName: string; followers: number | null; engagementRate: number | null }) {
    if (!activeWorkspace) return
    try {
      const body: Record<string, unknown> = { workspaceId: activeWorkspace.id, ...data }
      if (data.followers !== null) body.followers = data.followers
      if (data.engagementRate !== null) body.engagementRate = data.engagementRate
      const res = await fetch(`${apiUrl}/api/v1/competitors`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const body2 = (await res.json()) as { error?: string }
        showToast(body2.error ?? 'Failed to add competitor')
        return
      }
      setShowAddModal(false)
      showToast('Competitor added!')
      fetchCompetitors()
    } catch {
      showToast('Network error')
    }
  }

  async function handleUpdate(comp: CompetitorAccount, followers: number, engagementRate: number) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/competitors/${comp.id}/snapshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ followers, engagementRate }),
      })
      if (!res.ok) { showToast('Failed to save snapshot'); return }
      setUpdateTarget(null)
      showToast('Snapshot saved!')
      fetchCompetitors()
    } catch {
      showToast('Network error')
    }
  }

  async function handleRemove(id: string) {
    setRemoveLoading(id)
    try {
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

      {showAddModal && (
        <AddModal onAdd={handleAdd} onClose={() => setShowAddModal(false)} />
      )}

      {updateTarget && (
        <UpdateModal
          comp={updateTarget}
          onSave={(f, e) => handleUpdate(updateTarget, f, e)}
          onClose={() => setUpdateTarget(null)}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Manually track follower counts and engagement rates over time.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}>+ Add Competitor</Button>
      </div>

      {/* Loading */}
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
          <p className="text-sm text-muted-foreground">Add a competitor to start benchmarking your growth.</p>
          <Button size="sm" onClick={() => setShowAddModal(true)}>+ Add Competitor</Button>
        </div>
      )}

      {!loading && !error && competitors.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {competitors.map((comp) => {
            const latest = comp.snapshots[0]
            const prev = comp.snapshots[1]
            const followerDiff = latest && prev ? latest.followers - prev.followers : null
            const trend = followerDiff === null ? null : followerDiff > 0 ? '↑' : followerDiff < 0 ? '↓' : '→'
            const trendColor = followerDiff === null ? '' : followerDiff > 0 ? 'text-green-600 dark:text-green-400' : followerDiff < 0 ? 'text-red-500' : 'text-muted-foreground'
            const isManual = latest?.source === 'MANUAL'

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
                  <div className="flex gap-4 text-sm items-end">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Followers</p>
                      <p className="font-semibold tabular-nums">
                        {latest.followers.toLocaleString()}
                        {trend && (
                          <span className={`ml-1.5 text-xs font-normal ${trendColor}`}>
                            {trend} {followerDiff !== null && Math.abs(followerDiff) > 0 && Math.abs(followerDiff).toLocaleString()}
                          </span>
                        )}
                      </p>
                    </div>
                    {latest.estimatedEngagement > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Engagement</p>
                        <p className="font-semibold">{latest.estimatedEngagement.toFixed(2)}%</p>
                      </div>
                    )}
                    <div className="ml-auto">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isManual ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                        {isManual ? '✓ Real data' : 'No data yet'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No data yet — click Update to add stats.</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setUpdateTarget(comp)}
                  >
                    Update Data
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
