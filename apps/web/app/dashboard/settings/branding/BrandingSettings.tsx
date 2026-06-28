'use client'

import { useState, useEffect } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toast, ToastTitle, ToastDescription, ToastClose } from '@/components/ui/toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface BrandingData {
  brandName: string | null
  brandLogoUrl: string | null
  brandColor: string | null
  customDomain: string | null
}

interface Props {
  token: string
}

export default function BrandingSettings({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [brandName, setBrandName] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [brandColor, setBrandColor] = useState('#6366f1')
  const [customDomain, setCustomDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; title: string; description: string; variant?: 'default' | 'destructive' }>({ open: false, title: '', description: '' })

  useEffect(() => {
    if (!activeWorkspace) return
    setLoading(true)
    fetch(`${API_URL}/api/v1/branding/${activeWorkspace.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: BrandingData) => {
        setBrandName(data.brandName ?? '')
        setBrandLogoUrl(data.brandLogoUrl ?? '')
        setBrandColor(data.brandColor ?? '#6366f1')
        setCustomDomain(data.customDomain ?? '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [activeWorkspace, token])

  async function handleSave() {
    if (!activeWorkspace) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/branding/${activeWorkspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brandName: brandName || null,
          brandLogoUrl: brandLogoUrl || null,
          brandColor: brandColor || null,
          customDomain: customDomain || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setToast({ open: true, title: 'Error', description: body.error ?? 'Failed to save branding', variant: 'destructive' })
        return
      }
      setToast({ open: true, title: 'Saved!', description: 'Branding settings updated successfully.' })
    } catch {
      setToast({ open: true, title: 'Error', description: 'Network error — please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (!activeWorkspace) {
    return <div className="p-6 text-muted-foreground">No workspace selected.</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Branding</h1>
        <p className="text-muted-foreground mt-1">Customize your workspace&apos;s white-label appearance.</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          {/* Brand Name */}
          <div className="space-y-2">
            <Label htmlFor="brandName">Brand Name</Label>
            <Input
              id="brandName"
              placeholder="OmniPulse"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Replaces &quot;OmniPulse&quot; in the UI for your clients.</p>
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="brandLogoUrl">Logo URL</Label>
            <Input
              id="brandLogoUrl"
              placeholder="https://yourbrand.com/logo.png"
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
            />
            {brandLogoUrl && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brandLogoUrl}
                  alt="Brand logo preview"
                  className="h-16 w-auto rounded border object-contain bg-white p-1"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
          </div>

          {/* Brand Color */}
          <div className="space-y-2">
            <Label htmlFor="brandColor">Brand Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="brandColor"
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded border p-0.5"
              />
              <div
                className="h-10 flex-1 rounded-md border"
                style={{ backgroundColor: brandColor }}
              />
              <span className="text-sm font-mono text-muted-foreground w-20">{brandColor}</span>
            </div>
            <p className="text-xs text-muted-foreground">Used as the primary accent color in your client portal.</p>
          </div>

          {/* Custom Domain */}
          <div className="space-y-2">
            <Label htmlFor="customDomain">Custom Domain</Label>
            <Input
              id="customDomain"
              placeholder="app.yourbrand.com"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Point a CNAME to <span className="font-mono">getomnipulse.com</span> to activate your custom domain.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Branding'}
          </Button>
        </div>
      )}

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
