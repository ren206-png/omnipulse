'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { loginAction, verifyTwoFactorAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const searchParams = useSearchParams()
  const justReset = searchParams.get('reset') === '1'

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loginAction(email, password)
      if (result?.error) {
        setError(result.error)
      } else if (result?.requiresTwoFactor && result.twoFactorToken) {
        setTwoFactorToken(result.twoFactorToken)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFactor = async () => {
    if (!twoFactorToken) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifyTwoFactorAction(twoFactorToken, otpCode.trim())
      if (result?.error) setError(result.error)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // 2FA step
  if (twoFactorToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm">
          <div className="space-y-2 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold">Two-factor authentication</h1>
            <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Authentication code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTwoFactor()}
                maxLength={10}
                className="font-mono text-lg tracking-widest text-center"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Or enter a backup code (XXXX-XXXX).</p>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <Button className="w-full" onClick={handleTwoFactor} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </Button>
            <button
              type="button"
              onClick={() => { setTwoFactorToken(null); setError(null); setOtpCode('') }}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 bg-background p-8 rounded-lg border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">OmniPulse</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {justReset && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-md text-center">
            Password updated — sign in with your new password.
          </div>
        )}

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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/reset-password"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-foreground underline underline-offset-4 hover:text-primary">
              Sign up
            </Link>
          </p>
          {process.env.NEXT_PUBLIC_DEV_MODE === 'true' && (
            <div className="text-xs text-muted-foreground bg-muted/60 rounded-md px-3 py-2 space-y-0.5">
              <p className="font-medium text-foreground">Demo account</p>
              <p>demo@getomnipulse.com</p>
              <p>Demo1234!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
