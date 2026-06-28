'use client'

import { useEffect, useState, useCallback } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'

interface ActivityEntry {
  id: string
  createdAt: string
  userEmail: string
  action: string
  targetType?: string
  details?: string
}

interface Props {
  token: string
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function ActivityLog({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [logs, setLogs] = useState<ActivityEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const limit = 50

  const fetchLogs = useCallback(async (p: number) => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const res = await fetch(
        `${API}/api/v1/activity?workspaceId=${activeWorkspace.id}&page=${p}&limit=${limit}`,
        { headers: { Cookie: `token=${token}` }, credentials: 'include' }
      )
      if (!res.ok) return
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, token])

  useEffect(() => { fetchLogs(page) }, [fetchLogs, page])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="text-sm text-muted-foreground mt-1">Recent actions in your workspace.</p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Target</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No activity yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{log.userEmail}</td>
                  <td className="px-4 py-3 font-medium">{log.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.targetType ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{log.details ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border bg-card hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border bg-card hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
