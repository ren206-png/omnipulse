'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    setError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Failed to reset password')
        return
      }
      router.push('/login?reset=1')
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
          <p className="text-sm text-muted-foreground">Choose a new password</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
