'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

type Step = 'idle' | 'setup' | 'verify' | 'done' | 'disable'

export function TwoFactorManager({ token }: { token: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/v1/2fa/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json() as Promise<{ enabled: boolean }>)
      .then((d) => setEnabled(d.enabled))
      .catch(() => setEnabled(false))
  }, [token])

  async function startSetup() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/2fa/setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json() as { secret?: string; qrCode?: string; message?: string }
      if (!res.ok) { setError(body.message ?? 'Setup failed'); return }
      setSecret(body.secret!)
      setQrCode(body.qrCode!)
      setStep('setup')
    } finally {
      setLoading(false)
    }
  }

  async function verifySetup() {
    if (!code.trim()) { setError('Enter the 6-digit code from your authenticator app'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/2fa/verify-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await res.json() as { enabled?: boolean; backupCodes?: string[]; message?: string }
      if (!res.ok) { setError(body.message ?? 'Verification failed'); return }
      setBackupCodes(body.backupCodes!)
      setEnabled(true)
      setStep('done')
    } finally {
      setLoading(false)
    }
  }

  async function disableTwoFactor() {
    if (!code.trim()) { setError('Enter your 6-digit authenticator code or a backup code'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await res.json() as { enabled?: boolean; message?: string }
      if (!res.ok) { setError(body.message ?? 'Failed to disable'); return }
      setEnabled(false)
      setStep('idle')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  if (enabled === null) {
    return <div className="h-32 rounded-xl border bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
          {enabled ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{enabled ? '2FA is enabled' : '2FA is not enabled'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled
              ? 'Your account is protected with a time-based one-time password.'
              : 'Add an extra layer of security by requiring a code from your authenticator app when you sign in.'}
          </p>
        </div>
        {enabled ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-shrink-0 text-destructive border-destructive/40 hover:bg-destructive/5"
            onClick={() => { setStep('disable'); setCode(''); setError(null) }}
          >
            Disable
          </Button>
        ) : (
          <Button size="sm" className="flex-shrink-0" onClick={startSetup} disabled={loading}>
            {loading ? 'Loading…' : 'Enable 2FA'}
          </Button>
        )}
      </div>

      {/* Setup: scan QR */}
      {step === 'setup' && qrCode && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Step 1 — Scan this QR code</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and scan the code below.
            </p>
          </div>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="2FA QR code" className="w-48 h-48 rounded-lg border" />
          </div>
          <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</p>
            <p className="font-mono text-sm font-medium tracking-widest break-all">{secret}</p>
          </div>
          <Button size="sm" onClick={() => { setStep('verify'); setCode(''); setError(null) }}>
            I've scanned it →
          </Button>
        </div>
      )}

      {/* Verify setup */}
      {step === 'verify' && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Step 2 — Verify your authenticator app</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the 6-digit code currently shown in your app to confirm setup.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Verification code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              inputMode="numeric"
              className="w-40 font-mono text-lg tracking-widest h-11"
              onKeyDown={(e) => e.key === 'Enter' && verifySetup()}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={verifySetup} disabled={loading}>
              {loading ? 'Verifying…' : 'Activate 2FA'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setStep('idle'); setCode('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Show backup codes after activation */}
      {step === 'done' && backupCodes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Save your backup codes</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Store these codes somewhere safe. Each can be used once to sign in if you lose access to your authenticator app.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((c) => (
              <code key={c} className="rounded bg-amber-100 dark:bg-amber-900/40 px-3 py-1.5 font-mono text-sm text-amber-900 dark:text-amber-200 text-center">
                {c}
              </code>
            ))}
          </div>
          <Button size="sm" onClick={() => { setStep('idle'); setBackupCodes(null) }}>
            Done — I've saved them
          </Button>
        </div>
      )}

      {/* Disable flow */}
      {step === 'disable' && (
        <div className="rounded-xl border border-destructive/30 bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-destructive">Disable two-factor authentication</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your current authenticator code or one of your backup codes to confirm.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000 or XXXX-XXXX"
              className="w-52 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && disableTwoFactor()}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={disableTwoFactor}
              disabled={loading}
            >
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setStep('idle'); setCode(''); setError(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
