'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function DigestSettings({ token }: { token: string }) {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? searchParams.get('workspace') ?? undefined

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendDigest() {
    setSending(true)
    setSent(false)
    setError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/digest/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Failed to send digest')
        return
      }
      setSent(true)
      setTimeout(() => setSent(false), 5000)
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
        <h1 className="text-2xl font-bold tracking-tight">Weekly Email Digest</h1>
        <p className="text-muted-foreground mt-1">
          Get a weekly performance summary every Monday morning
        </p>
      </div>

      {/* What's included */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-base">What&apos;s included in your digest</h2>
        <ul className="space-y-3">
          {[
            {
              icon: '📝',
              title: 'Posts Published',
              description: 'Total number of posts published in the past 7 days',
            },
            {
              icon: '💬',
              title: 'Total Engagement',
              description: 'Combined likes, comments, and shares across all platforms',
            },
            {
              icon: '📈',
              title: 'Follower Growth',
              description: 'Follower count changes for each connected social account',
            },
            {
              icon: '🏆',
              title: 'Top Post',
              description: 'Your highest-performing post of the week by engagement',
            },
          ].map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5">{item.icon}</span>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Schedule info */}
      <div className="rounded-xl border bg-muted/30 p-5 flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium">Sent every Monday at 9:00 AM UTC</p>
          <p className="text-xs text-muted-foreground">
            Your digest is automatically emailed to the workspace owner each week
          </p>
        </div>
      </div>

      {/* Send test */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-base">Send a test digest</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Trigger an immediate digest email for this workspace to preview what your report looks like
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        {sent && (
          <div className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-3 py-2 rounded-md flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Digest sent to your email!
          </div>
        )}

        <Button onClick={handleSendDigest} disabled={sending} className="gap-2">
          {sending ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Send Weekly Report Now
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
