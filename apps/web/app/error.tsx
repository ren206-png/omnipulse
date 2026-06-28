'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. You can try again or return to the dashboard.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Dashboard
          </a>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
