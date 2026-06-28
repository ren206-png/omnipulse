'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'

interface SharedReport {
  id: string
  token: string
  label: string | null
  expiresAt: string | null
  createdAt: string
  shareUrl: string
}

interface ReportConfig {
  label: string
  startDate: string
  endDate: string
  includeFollowerGrowth: boolean
  includePostPerformance: boolean
  includeBestTimes: boolean
  includeEngagement: boolean
}

interface Props {
  workspaceId: string
  token: string
}

// @media print: .print-hide { display: none } .print-only { display: block }
// Add this in globals.css if needed for PDF download via window.print()

function GenerateReportModal({
  workspaceId,
  authToken,
  onClose,
}: {
  workspaceId: string
  authToken: string
  onClose: () => void
}) {
  const [config, setConfig] = useState<ReportConfig>({
    label: '',
    startDate: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    includeFollowerGrowth: true,
    includePostPerformance: true,
    includeBestTimes: true,
    includeEngagement: true,
  })
  const [step, setStep] = useState<'config' | 'preview'>('config')
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('Your Workspace')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  useEffect(() => {
    // Try to fetch workspace name
    fetch(`${apiUrl}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((d: { workspaces?: Array<{ id: string; name: string }> }) => {
        const ws = d.workspaces?.find((w) => w.id === workspaceId)
        if (ws) setWorkspaceName(ws.name)
      })
      .catch(() => { /* silent */ })
  }, [workspaceId, authToken, apiUrl])

  async function handleShare() {
    setSharing(true)
    try {
      const body: Record<string, string> = { workspaceId, startDate: config.startDate, endDate: config.endDate }
      if (config.label.trim()) body.label = config.label.trim()
      const res = await fetch(`${apiUrl}/api/v1/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { setSharing(false); return }
      const data = (await res.json()) as { report: SharedReport & { shareUrl: string } }
      const url = data.report.shareUrl
      setShareUrl(url)
      navigator.clipboard.writeText(url).catch(() => { /* ignore */ })
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 3000)
    } catch { /* silent */ } finally {
      setSharing(false)
    }
  }

  const sections = [
    { key: 'includeFollowerGrowth', label: 'Follower Growth' },
    { key: 'includePostPerformance', label: 'Post Performance' },
    { key: 'includeBestTimes', label: 'Best Times' },
    { key: 'includeEngagement', label: 'Engagement' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        {step === 'config' ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Generate Report</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Report Label</label>
                <input
                  type="text"
                  placeholder="e.g. Q2 2025 Performance Review"
                  value={config.label}
                  onChange={(e) => setConfig((c) => ({ ...c, label: e.target.value }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={config.startDate}
                    onChange={(e) => setConfig((c) => ({ ...c, startDate: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={config.endDate}
                    onChange={(e) => setConfig((c) => ({ ...c, endDate: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Include Sections</label>
                <div className="grid grid-cols-2 gap-2">
                  {sections.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config[key]}
                        onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.checked }))}
                        className="rounded border"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep('preview')}>Preview Report</Button>
            </div>
          </div>
        ) : (
          /* Print-friendly report preview */
          <div className="p-6 space-y-6" id="report-preview">
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-xl">OmniPulse</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground text-sm">Analytics Report</span>
                </div>
                <h1 className="text-2xl font-bold">{config.label || 'Performance Report'}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {workspaceName} · {format(new Date(config.startDate), 'MMM d, yyyy')} – {format(new Date(config.endDate), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => setStep('config')}>Edit</Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>Download PDF</Button>
                <Button size="sm" onClick={handleShare} disabled={sharing}>
                  {sharing ? 'Creating link…' : shareUrl ? (shareCopied ? '✓ Copied!' : 'Share Report') : 'Share Report'}
                </Button>
              </div>
            </div>

            {shareUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 print:hidden">
                Share link created and copied: <span className="font-mono text-xs">{shareUrl}</span>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Date Range', value: `${Math.ceil((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24))} days` },
                { label: 'Report Type', value: 'Analytics' },
                { label: 'Workspace', value: workspaceName },
                { label: 'Generated', value: format(new Date(), 'MMM d, yyyy') },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-semibold text-sm mt-0.5 truncate">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Sections */}
            <div className="space-y-4">
              {config.includeFollowerGrowth && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Follower Growth</h3>
                  <p className="text-xs text-muted-foreground">Follower growth data for {format(new Date(config.startDate), 'MMM d')} – {format(new Date(config.endDate), 'MMM d, yyyy')}. Connect your social accounts to see live data.</p>
                  <div className="h-24 bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground">
                    Chart placeholder — live data from connected accounts
                  </div>
                </div>
              )}
              {config.includePostPerformance && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Post Performance</h3>
                  <p className="text-xs text-muted-foreground">Engagement metrics across all posts in the selected period.</p>
                  <div className="h-24 bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground">
                    Chart placeholder — live data from connected accounts
                  </div>
                </div>
              )}
              {config.includeBestTimes && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Best Times to Post</h3>
                  <p className="text-xs text-muted-foreground">Optimal posting windows based on your audience engagement patterns.</p>
                  <div className="h-20 bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground">
                    Heatmap placeholder — live data from connected accounts
                  </div>
                </div>
              )}
              {config.includeEngagement && (
                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Engagement Overview</h3>
                  <p className="text-xs text-muted-foreground">Likes, comments, shares, and saves across platforms.</p>
                  <div className="h-20 bg-muted/40 rounded flex items-center justify-center text-xs text-muted-foreground">
                    Metrics placeholder — live data from connected accounts
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4 text-xs text-muted-foreground print:block">
              Report generated by OmniPulse on {format(new Date(), 'MMMM d, yyyy')} · {workspaceName}
            </div>

            <div className="flex justify-end gap-2 print:hidden">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ReportsPanel({ workspaceId, token }: Props) {
  const [open, setOpen] = useState(false)
  const [reports, setReports] = useState<SharedReport[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newExpiry, setNewExpiry] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/reports?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { reports: SharedReport[] }
      setReports(data.reports)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token, apiUrl])

  useEffect(() => {
    if (open) fetchReports()
  }, [open, fetchReports])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const body: Record<string, string> = { workspaceId }
      if (newLabel.trim()) body.label = newLabel.trim()
      if (newExpiry) body.expiresAt = new Date(newExpiry).toISOString()

      const res = await fetch(`${apiUrl}/api/v1/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { report: SharedReport & { shareUrl: string } }
      // Re-fetch list
      await fetchReports()
      setShowForm(false)
      setNewLabel('')
      setNewExpiry('')
      // Auto-copy new URL
      navigator.clipboard.writeText(data.report.shareUrl).catch(() => {/* silent */})
      setCopiedId(data.report.id)
      setTimeout(() => setCopiedId(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report')
    }
  }

  const handleCopy = (report: SharedReport) => {
    navigator.clipboard.writeText(report.shareUrl).catch(() => {/* silent */})
    setCopiedId(report.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
      {showGenerateModal && (
        <GenerateReportModal
          workspaceId={workspaceId}
          authToken={token}
          onClose={() => { setShowGenerateModal(false); fetchReports() }}
        />
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Collapsible header */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span className="font-semibold text-sm">Shareable Reports</span>
            {reports.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {reports.length}
              </span>
            )}
          </div>
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="border-t px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Generate a public link that shows a read-only analytics snapshot — no login required. Share
                with clients directly.
              </p>
              <Button size="sm" onClick={() => setShowGenerateModal(true)} className="shrink-0 ml-4">
                Generate Report
              </Button>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            {/* Quick share-link form */}
            {showForm ? (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium">New share link</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Label (optional, e.g. Q2 2025 Review)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Expiry date (optional)</label>
                    <input
                      type="datetime-local"
                      value={newExpiry}
                      onChange={(e) => setNewExpiry(e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreate} disabled={creating}>
                    {creating ? 'Creating…' : 'Create & copy link'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowForm(false); setNewLabel(''); setNewExpiry('') }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                Quick Share Link
              </Button>
            )}

            {/* Reports list */}
            {loading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="animate-pulse h-14 rounded-lg bg-muted/50" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No shared reports yet. Generate one above.
              </p>
            ) : (
              <div className="space-y-2">
                {reports.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.label ?? 'Untitled report'}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.shareUrl}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          Created {format(new Date(r.createdAt), 'MMM d, yyyy')}
                        </span>
                        {r.expiresAt && (
                          <span className={`text-[10px] ${new Date(r.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Expires {format(new Date(r.expiresAt), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => handleCopy(r)}
                      >
                        {copiedId === r.id ? 'Copied!' : 'Copy link'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(r.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
