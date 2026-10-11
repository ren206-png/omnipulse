'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function CheckEmail() {
  const params = useSearchParams()
  const justSent = params.get('sent') === '1'
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const resend = async () => {
    if (!email.includes('@')) { setError('Enter the email you signed up with'); setStatus('error'); return }
    setStatus('sending')
    setError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Could not send the email')
        setStatus('error')
        return
      }
      setStatus('sent')
    } catch {
      setError('Network error — please try again')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">OmniPulse</h1>
          <p className="text-sm text-muted-foreground">
            {justSent
              ? 'Check your inbox — we sent a link to confirm your email. It expires in 24 hours.'
              : 'Need a new confirmation link? Enter your email and we will send one.'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && resend()}
            />
          </div>

          {status === 'error' && error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</div>
          )}
          {status === 'sent' && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md">
              If that account needs confirming, a new link is on its way.
            </div>
          )}

          <Button className="w-full" onClick={resend} disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : justSent ? 'Resend email' : 'Send confirmation email'}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmail />
    </Suspense>
  )
}
