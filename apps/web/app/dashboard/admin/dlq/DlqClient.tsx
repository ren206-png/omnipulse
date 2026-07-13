'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
  LINKEDIN: 'bg-sky-100 text-sky-700',
}

interface DlqItem {
  id: string
  postId: string
  content: string
  platform: string
  errorMessage: string
  attempts: number
  failedAt: string
  workspaceName: string
}

export function DlqClient({ token }: { token: string }) {
  const [items, setItems] = useState<DlqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchDlq = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/dlq`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 403) {
        setError('Access denied — admin only')
        return
      }
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Failed to load DLQ')
        return
      }
      const data = (await res.json()) as { items?: DlqItem[] } | DlqItem[]
      const list = Array.isArray(data) ? data : (data.items ?? [])
      setItems(list)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchDlq() }, [fetchDlq])

  async function handleRetry(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/dlq/${id}/retry`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to retry')
        return
      }
      showToast('Post queued for retry')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResolve(id: string) {
    setActionLoading(id)
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/dlq/${id}/resolve`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        showToast(body.error ?? 'Failed to resolve')
        return
      }
      showToast('Marked as resolved')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      showToast('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchDlq}>Retry</Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-2">
          <div className="text-4xl">✅</div>
          <p className="font-semibold">No failed posts</p>
          <p className="text-sm text-muted-foreground">All posts have published successfully.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Post</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Platform</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Error</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Attempts</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Failed At</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Workspace</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-sm line-clamp-2 text-muted-foreground">{item.content}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[item.platform] ?? 'bg-muted text-muted-foreground')}>
                      {item.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-xs text-destructive line-clamp-2">{item.errorMessage}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium">{item.attempts}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(item.failedAt), 'MMM d, yyyy · h:mm a')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{item.workspaceName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleRetry(item.id)}
                        disabled={actionLoading === item.id}
                      >
                        {actionLoading === item.id ? '…' : '🔄 Retry'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => handleResolve(item.id)}
                        disabled={actionLoading === item.id}
                      >
                        {actionLoading === item.id ? '…' : '✓ Resolve'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
