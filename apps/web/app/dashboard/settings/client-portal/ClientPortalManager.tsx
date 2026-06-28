'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toast, ToastTitle, ToastDescription, ToastClose } from '@/components/ui/toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

interface PortalData {
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

export default function ClientPortalManager({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [portal, setPortal] = useState<PortalData | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; title: string; description: string; variant?: 'default' | 'destructive' }>({ open: false, title: '', description: '' })

  const showToast = (title: string, description: string, variant?: 'default' | 'destructive') => {
    setToast({ open: true, title, description, variant })
  }

  // Fetch current portal status by trying to enable (we'll read from a GET on the workspace instead)
  // We use a lightweight approach: try to get portal info from our known token
  const fetchPortal = useCallback(async () => {
    if (!activeWorkspace) return
    // We don't have a GET route, so we'll store portal state after first enable.
    // The portal state is tracked locally / returned on enable.
  }, [activeWorkspace])

  useEffect(() => { fetchPortal() }, [fetchPortal])

  async function handleEnable() {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/client-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, clientName: clientName || null, clientEmail: clientEmail || null }),
      })
      if (!res.ok) {
        const body = await res.json()
        showToast('Error', body.error ?? 'Failed to enable portal', 'destructive')
        return
      }
      const { portal: p } = await res.json() as { portal: PortalData }
      setPortal(p)
      setClientName(p.clientName ?? '')
      setClientEmail(p.clientEmail ?? '')
      showToast('Portal enabled!', 'Share the link below with your client.')
    } catch {
      showToast('Error', 'Network error — please try again.', 'destructive')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    if (!activeWorkspace || !portal) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/client-portal/${activeWorkspace.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json()
        showToast('Error', body.error ?? 'Failed to disable portal', 'destructive')
        return
      }
      setPortal((p) => p ? { ...p, active: false } : null)
      showToast('Portal disabled', 'The portal link is no longer accessible.')
    } catch {
      showToast('Error', 'Network error — please try again.', 'destructive')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyLink() {
    if (!portal) return
    const url = `${APP_URL}/portal/${portal.token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!activeWorkspace) {
    return <div className="p-6 text-muted-foreground">No workspace selected.</div>
  }

  const portalUrl = portal ? `${APP_URL}/portal/${portal.token}` : null

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Client Portal</h1>
        <p className="text-muted-foreground mt-1">
          Share a read-only view of your analytics and posts with your client.
        </p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg border p-4 flex items-center gap-3 ${portal?.active ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-muted bg-muted/30'}`}>
        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${portal?.active ? 'bg-green-500' : 'bg-gray-400'}`} />
        <div>
          <p className="font-medium text-sm">
            {portal?.active ? 'Portal is active' : portal ? 'Portal is disabled' : 'No portal created yet'}
          </p>
          {portal?.active && portalUrl && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{portalUrl}</p>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="clientName">Client Name</Label>
          <Input
            id="clientName"
            placeholder="Acme Corp"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="clientEmail">Client Email</Label>
          <Input
            id="clientEmail"
            type="email"
            placeholder="client@acmecorp.com"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleEnable} disabled={loading}>
          {loading ? 'Processing…' : portal?.active ? 'Update Portal' : 'Enable Portal'}
        </Button>

        {portal?.active && (
          <>
            <Button variant="outline" onClick={handleCopyLink}>
              {copied ? 'Copied!' : 'Copy Portal Link'}
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={loading}>
              Disable Portal
            </Button>
          </>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-medium">How it works</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Enable the portal to generate a unique shareable link.</li>
          <li>Share this link with your client for a read-only view of analytics and posts.</li>
          <li>The portal shows follower counts, engagement rates, and recent published or scheduled posts.</li>
          <li>Disable the portal at any time to revoke access immediately.</li>
        </ul>
      </div>

      {toast.open && (
        <Toast
          open={toast.open}
          onOpenChange={(open) => setToast((t) => ({ ...t, open }))}
          variant={toast.variant}
        >
          <div className="grid gap-1">
            <ToastTitle>{toast.title}</ToastTitle>
            {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      )}
    </div>
  )
}
