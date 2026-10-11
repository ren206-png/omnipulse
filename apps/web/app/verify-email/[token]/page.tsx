'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function ConfirmEmailPage() {
  const params = useParams<{ token: string }>()
  const [state, setState] = useState<{ phase: 'working' } | { phase: 'ok' } | { phase: 'error'; message: string }>({ phase: 'working' })
  // The token is single-use: guard against the effect running twice (React strict mode)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: params.token }),
    })
      .then(async (res) => {
        if (res.ok) { setState({ phase: 'ok' }); return }
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setState({ phase: 'error', message: body.error ?? 'This confirmation link is invalid or has expired.' })
      })
      .catch(() => setState({ phase: 'error', message: 'Network error — please try again.' }))
  }, [params.token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm text-center">
        <h1 className="text-2xl font-bold">OmniPulse</h1>
        {state.phase === 'working' && <p className="text-sm text-muted-foreground">Confirming your email…</p>}
        {state.phase === 'ok' && (
          <>
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md">
              Email confirmed. You can now sign in.
            </p>
            <Link href="/login" className="inline-block underline underline-offset-4">Go to sign in</Link>
          </>
        )}
        {state.phase === 'error' && (
          <>
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{state.message}</p>
            <Link href="/verify-email" className="inline-block underline underline-offset-4">Send a new confirmation link</Link>
          </>
        )}
      </div>
    </div>
  )
}
