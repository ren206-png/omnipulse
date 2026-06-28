'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signupAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await signupAction(email, password, confirmPassword)
      if (result?.error) setError(result.error)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">OmniPulse</h1>
          <p className="text-sm text-muted-foreground">Create your account</p>
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
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
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
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </div>

        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4 hover:text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
