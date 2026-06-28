'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Toast, ToastTitle, ToastDescription, ToastClose } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const ALL_EVENTS = [
  'post.published',
  'post.failed',
  'post.scheduled',
  'inbox.new_message',
  'webhook.test',
] as const

type WebhookEvent = (typeof ALL_EVENTS)[number]

interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  active: boolean
  secret: string
  createdAt: string
}

interface Props {
  workspaceId: string
  token: string
}

export function WebhooksManager({ workspaceId, token }: Props) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formUrl, setFormUrl] = useState('')
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([])
  const [formActive, setFormActive] = useState(true)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // New secret reveal
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)

  // Reveal existing secret per endpoint
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())

  // Toast
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  const showToast = (msg: string) => { setToastMsg(msg); setToastOpen(true) }

  const fetchEndpoints = useCallback(async () => {
    setFetchError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { endpoints: WebhookEndpoint[] }
      setEndpoints(data.endpoints)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => { fetchEndpoints() }, [fetchEndpoints])

  function toggleFormEvent(event: WebhookEvent) {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  async function handleCreate() {
    setFormError(null)
    if (!formUrl.trim()) { setFormError('URL is required'); return }
    if (formEvents.length === 0) { setFormError('Select at least one event'); return }

    setFormLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, url: formUrl.trim(), events: formEvents, active: formActive }),
      })
      const data = (await res.json()) as { endpoint?: WebhookEndpoint; error?: string }
      if (!res.ok) { setFormError(data.error ?? 'Failed to create webhook'); return }

      // Show the secret once
      setNewSecret({ id: data.endpoint!.id, secret: data.endpoint!.secret })
      setShowForm(false)
      setFormUrl('')
      setFormEvents([])
      setFormActive(true)
      fetchEndpoints()
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleActive(ep: WebhookEndpoint) {
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks/${ep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !ep.active }),
      })
      if (!res.ok) { showToast('Failed to update webhook'); return }
      setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, active: !ep.active } : e))
    } catch {
      showToast('Network error')
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Failed to delete webhook'); return }
      setEndpoints((prev) => prev.filter((e) => e.id !== id))
      showToast('Webhook deleted')
    } catch {
      showToast('Network error')
    }
  }

  async function handleTest(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/v1/webhooks/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Failed to send test event'); return }
      showToast('Test event sent!')
    } catch {
      showToast('Network error')
    }
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret).catch(() => {})
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* One-time secret banner */}
      {newSecret && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 dark:text-yellow-400 text-lg leading-none">⚠</span>
            <div>
              <p className="font-semibold text-sm text-yellow-800 dark:text-yellow-300">Save your webhook secret now</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                This secret will not be shown again. Use it to verify that requests come from OmniPulse.
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs font-mono bg-yellow-100 dark:bg-yellow-900/50 px-3 py-2 rounded-md break-all border border-yellow-200 dark:border-yellow-700">
              {newSecret.secret}
            </code>
            <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => copySecret(newSecret.secret)}>
              {secretCopied ? '✓ Copied' : 'Copy'}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="text-xs text-yellow-700 dark:text-yellow-400" onClick={() => setNewSecret(null)}>
            I've saved it — dismiss
          </Button>
        </div>
      )}

      {/* Existing endpoints */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : fetchError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{fetchError}</span>
          <Button variant="ghost" size="sm" onClick={fetchEndpoints}>Retry</Button>
        </div>
      ) : endpoints.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No webhooks configured yet.</p>
          <p className="text-xs mt-1">Add one below to start receiving event notifications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{ep.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ep.events.map((ev) => (
                      <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(ep)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none',
                      ep.active ? 'bg-primary' : 'bg-muted',
                    )}
                    aria-label={ep.active ? 'Disable webhook' : 'Enable webhook'}
                    title={ep.active ? 'Active — click to disable' : 'Inactive — click to enable'}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                        ep.active ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                  <span className={cn('text-xs', ep.active ? 'text-green-600' : 'text-muted-foreground')}>
                    {ep.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Secret row */}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground shrink-0">Secret:</Label>
                <code className="text-[11px] font-mono text-muted-foreground flex-1 truncate">
                  {revealedSecrets.has(ep.id) ? ep.secret : ep.secret}
                </code>
                <button
                  type="button"
                  onClick={() => setRevealedSecrets((prev) => {
                    const next = new Set(prev)
                    if (next.has(ep.id)) next.delete(ep.id)
                    else next.add(ep.id)
                    return next
                  })}
                  className="text-[11px] text-primary hover:underline"
                >
                  {revealedSecrets.has(ep.id) ? 'Hide' : 'Reveal'}
                </button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleTest(ep.id)}>
                  Send Test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => handleDelete(ep.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Webhook form */}
      {showForm ? (
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold text-sm">New Webhook Endpoint</h3>

          <div className="space-y-1.5">
            <Label className="text-xs">Payload URL</Label>
            <Input
              placeholder="https://your-server.com/webhook"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Events to subscribe to</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_EVENTS.filter((e) => e !== 'webhook.test').map((event) => (
                <div key={event} className="flex items-center gap-2">
                  <Checkbox
                    id={`event-${event}`}
                    checked={formEvents.includes(event)}
                    onCheckedChange={() => toggleFormEvent(event)}
                  />
                  <label htmlFor={`event-${event}`} className="text-sm font-mono cursor-pointer select-none">
                    {event}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="form-active"
              checked={formActive}
              onCheckedChange={(v) => setFormActive(Boolean(v))}
            />
            <label htmlFor="form-active" className="text-sm cursor-pointer select-none">Active</label>
          </div>

          {formError && (
            <p className="text-xs text-destructive">{formError}</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={formLoading}>
              {formLoading ? 'Creating…' : 'Add Webhook'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setFormError(null) }} disabled={formLoading}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} variant="outline">
          + Add Webhook
        </Button>
      )}

      <Toast open={toastOpen} onOpenChange={setToastOpen} duration={4000}>
        <div className="grid gap-1">
          <ToastTitle>Webhooks</ToastTitle>
          <ToastDescription>{toastMsg}</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </div>
  )
}
