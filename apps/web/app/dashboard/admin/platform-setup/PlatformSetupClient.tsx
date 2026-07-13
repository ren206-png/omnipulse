'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface PlatformVar { name: string; set: boolean }
interface Platform {
  id: string
  name: string
  emoji: string
  configured: boolean
  vars: PlatformVar[]
  devUrl: string
  scopes: string
  callbackUrl: string
  notes: string
}
interface Billing {
  stripeConfigured: boolean
  stripeProPriceId: boolean
  stripeAgencyPriceId: boolean
  stripePublishableKey: boolean
  dashboardUrl: string
}
interface StatusData {
  callbackUrl: string
  platforms: Platform[]
  billing: Billing
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-2 text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors font-mono"
    >
      {copied ? '✅ Copied' : 'Copy'}
    </button>
  )
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
      {ok ? '✅ Configured' : '❌ Missing'}
    </span>
  )
}

export function PlatformSetupClient({ token }: { token: string }) {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/v1/admin/platform-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: StatusData) => setData(d))
      .catch(() => setError('Failed to load platform status'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="animate-pulse h-96 bg-muted rounded-xl" />
  if (error || !data) return <div className="text-destructive p-4">{error ?? 'Error'}</div>

  const configured = data.platforms.filter(p => p.configured).length
  const total = data.platforms.length

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Platform Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure OAuth credentials for each social platform. These are added as Railway environment variables.
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Platforms Connected</span>
          <span className="text-sm text-muted-foreground">{configured}/{total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(configured / total) * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {configured === 0 ? '⚠️ No platforms configured — users cannot connect social accounts yet.' : configured === total ? '🎉 All platforms configured!' : `${total - configured} platform${total - configured === 1 ? '' : 's'} remaining.`}
        </p>
      </div>

      {/* Callback URL — shared across all platforms */}
      <div className="rounded-xl border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 p-5 space-y-2">
        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">🔗 Your OAuth Callback URL</p>
        <p className="text-xs text-indigo-700 dark:text-indigo-300">Add this URL in every platform developer portal as the authorised redirect URI:</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs bg-white dark:bg-slate-900 border border-indigo-200 px-3 py-2 rounded-lg font-mono text-indigo-800 dark:text-indigo-200 break-all">
            {data.callbackUrl}
          </code>
          <CopyButton text={data.callbackUrl} />
        </div>
      </div>

      {/* Platform cards */}
      <div className="space-y-4">
        {data.platforms.map(platform => (
          <div key={platform.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Header */}
            <button
              className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setOpen(open === platform.id ? null : platform.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{platform.emoji}</span>
                <div>
                  <p className="font-semibold">{platform.name}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {platform.vars.map(v => (
                      <span key={v.name} className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', v.set ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                        {v.set ? '✓' : '✗'} {v.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge ok={platform.configured} />
                <span className="text-muted-foreground">{open === platform.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded steps */}
            {open === platform.id && (
              <div className="border-t px-5 pb-5 pt-4 space-y-5 bg-muted/20">

                {/* Step 1 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Step 1 — Create your developer app</p>
                  <a
                    href={platform.devUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
                  >
                    Open {platform.name} Developer Portal →
                  </a>
                  <p className="text-xs text-muted-foreground bg-white dark:bg-slate-900 border rounded-lg p-3 leading-relaxed">
                    {platform.notes}
                  </p>
                </div>

                {/* Step 2 — Callback URL */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Step 2 — Add this redirect / callback URL</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs bg-white dark:bg-slate-900 border px-3 py-2 rounded-lg font-mono break-all">
                      {data.callbackUrl}
                    </code>
                    <CopyButton text={data.callbackUrl} />
                  </div>
                </div>

                {/* Step 3 — Scopes */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Step 3 — Required scopes / permissions</p>
                  <code className="block text-xs bg-white dark:bg-slate-900 border px-3 py-2 rounded-lg font-mono text-muted-foreground">
                    {platform.scopes}
                  </code>
                </div>

                {/* Step 4 — Set Railway vars */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Step 4 — Add to Railway environment variables</p>
                  <p className="text-xs text-muted-foreground">Go to your Railway project → omnipulse service → Variables tab and add:</p>
                  <div className="space-y-2">
                    {platform.vars.map(v => (
                      <div key={v.name} className="flex items-center gap-3">
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', v.set ? 'bg-green-500' : 'bg-red-400')} />
                        <code className="text-xs font-mono bg-white dark:bg-slate-900 border px-2 py-1 rounded flex-1">
                          {v.name}=<span className="text-muted-foreground italic">your_{v.name.toLowerCase()}_here</span>
                        </code>
                        <CopyButton text={v.name} />
                        {v.set && <span className="text-xs text-green-600 font-medium">✅ Set</span>}
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      ⚠️ After adding variables, Railway will redeploy automatically. The platform will then appear as Connected on this page.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Billing section */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <p className="font-semibold">Stripe Billing</p>
              <p className="text-xs text-muted-foreground">Required for Pro and Agency plan upgrades</p>
            </div>
          </div>
          <StatusBadge ok={data.billing.stripeConfigured && data.billing.stripeProPriceId && data.billing.stripeAgencyPriceId} />
        </div>

        <div className="space-y-2">
          {[
            { label: 'STRIPE_SECRET_KEY', set: data.billing.stripeConfigured },
            { label: 'STRIPE_WEBHOOK_SECRET', set: data.billing.stripeConfigured },
            { label: 'STRIPE_PUBLISHABLE_KEY', set: data.billing.stripePublishableKey },
            { label: 'STRIPE_PRO_PRICE_ID', set: data.billing.stripeProPriceId },
            { label: 'STRIPE_AGENCY_PRICE_ID', set: data.billing.stripeAgencyPriceId },
          ].map(v => (
            <div key={v.label} className="flex items-center gap-3">
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', v.set ? 'bg-green-500' : 'bg-red-400')} />
              <code className="text-xs font-mono">{v.label}</code>
              <span className={cn('text-xs', v.set ? 'text-green-600' : 'text-red-600')}>{v.set ? '✅ Set' : '❌ Missing'}</span>
            </div>
          ))}
        </div>

        {(!data.billing.stripeProPriceId || !data.billing.stripeAgencyPriceId) && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">How to get Stripe Price IDs:</p>
            <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Go to <a href={data.billing.dashboardUrl} target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard → Products</a></li>
              <li>Create a "Pro" product with a $29/month recurring price</li>
              <li>Create an "Agency" product with a $99/month recurring price</li>
              <li>Copy the Price ID for each (starts with <code className="font-mono">price_</code>)</li>
              <li>Add to Railway as <code className="font-mono">STRIPE_PRO_PRICE_ID</code> and <code className="font-mono">STRIPE_AGENCY_PRICE_ID</code></li>
            </ol>
          </div>
        )}
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={() => { setLoading(true); setData(null); fetch(`${API_URL}/api/v1/admin/platform-status`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then((d: StatusData) => setData(d)).finally(() => setLoading(false)) }}
          className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          🔄 Refresh Status
        </button>
      </div>
    </div>
  )
}
