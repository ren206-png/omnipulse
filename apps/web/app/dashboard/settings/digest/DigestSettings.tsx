'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

const DIGEST_ENABLED_KEY = 'omnipulse_digest_enabled'

function decodeEmail(token: string): string {
  try {
    return JSON.parse(atob(token.split('.')[1]))?.email ?? ''
  } catch {
    return ''
  }
}

export function DigestSettings({ token }: { token: string }) {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? searchParams.get('workspace') ?? undefined

  const [enabled, setEnabled] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userEmail = decodeEmail(token)

  useEffect(() => {
    const stored = localStorage.getItem(DIGEST_ENABLED_KEY)
    if (stored !== null) setEnabled(stored === 'true')
  }, [])

  function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem(DIGEST_ENABLED_KEY, String(next))
  }

  async function handleSendTest() {
    setSending(true)
    setSent(false)
    setError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/digest/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Failed to send digest')
        return
      }
      setSent(true)
      setTimeout(() => setSent(false), 6000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">📧 Weekly Email Digest</h1>
        <p className="text-muted-foreground mt-1">
          Receive a weekly summary of your workspace performance every Monday morning.
        </p>
      </div>

      {/* Enable / Disable toggle */}
      <div className="rounded-xl border bg-card p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Enable weekly digest</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled
              ? 'You will receive a digest email every Monday at 9:00 AM UTC.'
              : 'Digest emails are currently disabled.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggleEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            enabled ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Preview section */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="font-semibold text-base">Your digest includes:</h2>
        <ul className="space-y-2">
          {[
            'Posts published this week',
            'Total engagement',
            'Follower changes per platform',
            'Top performing post',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary shrink-0"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Sent-to info */}
      {userEmail && (
        <div className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground shrink-0"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <p className="text-sm text-muted-foreground">
            Sent to: <span className="font-medium text-foreground">{userEmail}</span>
          </p>
        </div>
      )}

      {/* Send test */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Send a test digest</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Trigger an immediate digest email to preview what your weekly report looks like.
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        {sent && (
          <div className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-3 py-2 rounded-md">
            ✅ Test digest queued! Check your email.
          </div>
        )}

        <Button onClick={handleSendTest} disabled={sending} className="gap-2">
          {sending ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send Test
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
