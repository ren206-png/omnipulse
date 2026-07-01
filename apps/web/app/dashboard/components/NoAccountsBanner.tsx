'use client'
import { useState, useEffect } from 'react'

export function NoAccountsBanner({ token, workspaceId }: { token: string; workspaceId: string }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    const key = `no-accounts-dismissed-${workspaceId}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(key)) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/social-accounts?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { accounts?: unknown[] }) => {
        if (!data.accounts?.length) setShow(true)
      })
      .catch(() => {})
  }, [token, workspaceId])

  function dismiss() {
    const key = `no-accounts-dismissed-${workspaceId}`
    sessionStorage.setItem(key, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="mb-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔌</div>
        <div>
          <h3 className="font-semibold text-sm">Connect your first social account</h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
            OmniPulse needs a connected account to schedule and publish posts. It only takes 30 seconds.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a href="/dashboard/accounts" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect Account →
        </a>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-xs">
          Dismiss
        </button>
      </div>
    </div>
  )
}
