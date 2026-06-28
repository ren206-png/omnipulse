'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface InviteDetails {
  email: string
  role: string
  workspaceName: string
  workspaceId: string
  expiresAt: string
}

interface Props {
  inviteToken: string
  authToken: string
}

export function InviteClient({ inviteToken, authToken }: Props) {
  const router = useRouter()
  const [details, setDetails] = useState<InviteDetails | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiUrl}/api/v1/team/invitations/${inviteToken}`)
        const body = (await res.json()) as { invitation?: InviteDetails; error?: string }
        if (!res.ok) { setLoadError(body.error ?? 'Invitation not found'); return }
        setDetails(body.invitation!)
      } catch {
        setLoadError('Failed to load invitation')
      }
    }
    load()
  }, [inviteToken])

  async function handleAccept() {
    if (!authToken) {
      router.push(`/login?redirect=/invite/${inviteToken}`)
      return
    }
    setAccepting(true)
    setAcceptError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/team/invitations/${inviteToken}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
      const body = (await res.json()) as { workspaceId?: string; workspaceName?: string; error?: string }
      if (!res.ok) { setAcceptError(body.error ?? 'Failed to accept invitation'); return }
      setAccepted(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch {
      setAcceptError('Network error — please try again')
    } finally {
      setAccepting(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🔗</div>
          <h1 className="text-2xl font-bold">Invalid Invitation</h1>
          <p className="text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h1 className="text-2xl font-bold">You're in!</h1>
          <p className="text-muted-foreground">
            Welcome to <span className="font-semibold text-foreground">{details.workspaceName}</span>. Redirecting you to the dashboard…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="max-w-md w-full bg-background rounded-xl border shadow-sm p-8 space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">You've been invited to join</p>
          <h1 className="text-2xl font-bold">{details.workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            as a <span className="font-medium text-foreground capitalize">{details.role.toLowerCase()}</span>
          </p>
        </div>

        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
          <p className="text-muted-foreground">Invitation sent to:</p>
          <p className="font-medium">{details.email}</p>
        </div>

        {!authToken ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You need to be signed in to accept this invitation. Make sure you sign in with <span className="font-medium text-foreground">{details.email}</span>.
            </p>
            <Button className="w-full" onClick={handleAccept}>
              Sign in to Accept
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {acceptError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{acceptError}</p>
            )}
            <Button className="w-full" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Accepting…' : 'Accept Invitation'}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
              Decline
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Expires {new Date(details.expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}
