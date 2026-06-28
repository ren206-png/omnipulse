'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

type Plan = 'FREE' | 'PRO' | 'AGENCY'

interface PlanLimits {
  workspaces: number
  teamMembers: number
  scheduledPosts: number
  aiGenerations: number
  socialAccounts: number
  approvalWorkflow: boolean
}

interface BillingStatus {
  plan: Plan
  planName: string
  price: { monthly: number; label: string }
  limits: PlanLimits
  subscriptionStatus: string | null
  stripeCustomerId: string | null
}

interface Props {
  token: string
}

const PLANS: Array<{
  id: Plan
  name: string
  price: string
  description: string
  features: string[]
  highlight?: boolean
}> = [
  {
    id: 'FREE',
    name: 'Free',
    price: '$0',
    description: 'For solo creators getting started',
    features: [
      '1 workspace',
      '2 social accounts',
      'Up to 10 scheduled posts',
      'Calendar & analytics',
      'No team members',
      'No AI generation',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: '$29',
    description: 'For professionals and small teams',
    features: [
      '3 workspaces',
      '10 social accounts',
      '500 scheduled posts',
      'Up to 5 team members',
      'AI content generation',
      'Post approval workflow',
    ],
    highlight: true,
  },
  {
    id: 'AGENCY',
    name: 'Agency',
    price: '$99',
    description: 'For agencies managing multiple clients',
    features: [
      'Unlimited workspaces',
      'Unlimited social accounts',
      'Unlimited scheduled posts',
      'Unlimited team members',
      '100 AI generations / hour',
      'Post approval workflow',
    ],
  },
]

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary mt-0.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function BillingClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Plan | 'portal' | null>(null)

  const successParam = searchParams.get('success')
  const cancelledParam = searchParams.get('cancelled')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchStatus = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/billing/status?workspaceId=${activeWorkspace.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load billing status')
      const data = (await res.json()) as BillingStatus
      setStatus(data)
    } catch {
      setError('Failed to load billing information')
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleUpgrade(plan: Plan) {
    if (!activeWorkspace) return
    setActionLoading(plan)
    try {
      const res = await fetch(`${apiUrl}/api/v1/billing/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId: activeWorkspace.id, plan }),
      })
      const body = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !body.url) {
        setError(body.error ?? 'Failed to start checkout')
        return
      }
      window.location.href = body.url
    } catch {
      setError('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleManage() {
    if (!activeWorkspace) return
    setActionLoading('portal')
    try {
      const res = await fetch(`${apiUrl}/api/v1/billing/portal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      })
      const body = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !body.url) {
        setError(body.error ?? 'Failed to open billing portal')
        return
      }
      window.location.href = body.url
    } catch {
      setError('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }


  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage billing.</p>
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />)}
      </div>
    )
  }

  const currentPlan = status?.plan ?? 'FREE'

  return (
    <div className="space-y-6">
      {/* Banners */}
      {successParam && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          🎉 Subscription activated! Your plan has been upgraded.
        </div>
      )}
      {cancelledParam && (
        <div className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Checkout was cancelled — no changes were made.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Current plan summary */}
      {status && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium">
              Current plan: <span className="text-primary font-semibold">{status.planName}</span>
              {status.subscriptionStatus && status.subscriptionStatus !== 'active' && (
                <span className="ml-2 text-xs text-destructive capitalize">({status.subscriptionStatus})</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{status.price.label}</p>
          </div>
          {status.stripeCustomerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManage}
              disabled={actionLoading === 'portal'}
            >
              {actionLoading === 'portal' ? 'Opening…' : 'Manage Subscription'}
            </Button>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id
          const isDowngrade = (
            (currentPlan === 'AGENCY' && plan.id !== 'AGENCY') ||
            (currentPlan === 'PRO' && plan.id === 'FREE')
          )

          return (
            <div
              key={plan.id}
              className={cn(
                'rounded-xl border p-6 flex flex-col gap-4 relative',
                plan.highlight && !isCurrent && 'border-primary shadow-sm',
                isCurrent && 'border-primary bg-primary/5',
              )}
            >
              {plan.highlight && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                    Most popular
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-0.5 rounded-full">
                    Current plan
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.id !== 'FREE' && <span className="text-sm text-muted-foreground">/ month</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Button disabled variant="outline" className="w-full">Current plan</Button>
              ) : plan.id === 'FREE' ? (
                <Button
                  variant="outline"
                  className="w-full text-muted-foreground"
                  disabled
                >
                  {isDowngrade ? 'Downgrade via portal' : 'Free plan'}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={actionLoading === plan.id || isDowngrade}
                >
                  {actionLoading === plan.id
                    ? 'Redirecting…'
                    : isDowngrade
                    ? 'Manage via portal'
                    : `Upgrade to ${plan.name}`}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Payments are processed securely by Stripe. Cancel anytime — no lock-in.
      </p>
    </div>
  )
}
