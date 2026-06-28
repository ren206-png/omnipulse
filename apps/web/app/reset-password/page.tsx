'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    setLoading(true)
    setError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Something went wrong')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">OmniPulse</h1>
          <p className="text-sm text-muted-foreground">Reset your password</p>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              If that email is registered, you&apos;ll receive a reset link shortly.
              Check your inbox (and spam folder).
            </p>
            <Link
              href="/login"
              className="block text-sm text-foreground underline underline-offset-4 hover:text-primary"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <Button className="w-full" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Remember your password?{' '}
              <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
