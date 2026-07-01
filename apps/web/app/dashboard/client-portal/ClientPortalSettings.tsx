'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
const PORTAL_BASE = 'https://getomnipulse.com/portal'

interface PostApproval {
  id: string
  postId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment: string | null
  reviewedAt: string | null
  createdAt: string
}

interface Portal {
  id: string
  token: string
  clientName: string | null
  clientEmail: string | null
  active: boolean
  createdAt: string
}

interface Props {
  token: string
}

const STATUS_BADGE: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800 border border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border border-red-200',
  PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
}

export function ClientPortalSettings({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [portal, setPortal] = useState<Portal | null>(null)
  const [approvals, setApprovals] = useState<PostApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const portalUrl = portal ? `${PORTAL_BASE}/${portal.token}` : null

  const load = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/client-portal?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.portal) {
          setPortal(data.portal)
          setClientName(data.portal.clientName ?? '')
          setClientEmail(data.portal.clientEmail ?? '')
        }
      }
    } catch {
      /* swallow */
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace?.id, token])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    if (!activeWorkspace?.id) return
    setSaving(true)
    setError(null)
    setSaveMsg(null)
    try {
      const method = portal ? 'PATCH' : 'POST'
      const res = await fetch(`${API_URL}/api/v1/client-portal`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, clientName, clientEmail }),
      })
      if (!res.ok) { setError('Failed to save portal settings.'); return }
      const data = await res.json()
      setPortal(data.portal)
      setSaveMsg('Settings saved.')
      setTimeout(() => setSaveMsg(null), 3000)
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!portal || !activeWorkspace?.id) return
    try {
      const res = await fetch(`${API_URL}/api/v1/client-portal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, active: !portal.active }),
      })
      if (res.ok) {
        const data = await res.json()
        setPortal(data.portal)
      }
    } catch { /* swallow */ }
  }

  async function copyUrl() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (workspacesLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading portal settings…
      </div>
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="rounded-xl border p-6 text-center text-muted-foreground">
        Select a workspace to manage the client portal.
      </div>
    )
  }

  const mailtoHref = portal
    ? `mailto:${clientEmail}?subject=Your%20Content%20Review%20Portal&body=Hi%20${encodeURIComponent(clientName || 'there')}%2C%0A%0AHere%20is%20your%20private%20link%20to%20review%20upcoming%20content%3A%0A${encodeURIComponent(portalUrl ?? '')}%0A%0ANo%20login%20required.`
    : '#'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status toggle */}
      <div className="rounded-xl border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Portal Status</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {portal?.active ? 'Active — client can access the review link.' : 'Inactive — the review link is disabled.'}
          </p>
        </div>
        {portal ? (
          <button
            onClick={handleToggleActive}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${portal.active ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${portal.active ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic">Save settings to activate</span>
        )}
      </div>

      {/* Client info */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-sm">Client Details</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Client Name</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Client Email</label>
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {saveMsg && <p className="text-xs text-green-600">{saveMsg}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Portal URL */}
      {portalUrl && (
        <div className="rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">Client Portal Link</h2>
          <p className="text-xs text-muted-foreground">Share this private link with your client. No login required.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs break-all font-mono">{portalUrl}</code>
            <button
              onClick={copyUrl}
              className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <span>📨</span> Email to client
          </a>
        </div>
      )}

      {/* Recent approvals */}
      {approvals.length > 0 && (
        <div className="rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-sm">Recent Approvals</h2>
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div className="text-xs text-muted-foreground font-mono truncate">{a.postId}</div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.comment && (
                    <span className="text-xs text-muted-foreground italic truncate max-w-32">{a.comment}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[a.status] ?? STATUS_BADGE.PENDING}`}>
                    {a.status}
                  </span>
                  {a.reviewedAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.reviewedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
