'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DashboardError]', error)
  }, [error])

  return (
    <div className="p-4">
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-destructive font-medium">
          Dashboard failed to load: {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={reset}
            className="text-sm font-medium text-destructive underline-offset-4 hover:underline transition-colors"
          >
            Retry
          </button>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
