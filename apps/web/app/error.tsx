'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { OmniPulseLogo } from '@/components/OmniPulseLogo'

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="rounded-xl border bg-card text-foreground shadow-sm w-full max-w-sm p-8 space-y-6 text-center">
        <OmniPulseLogo className="mx-auto h-8 w-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">⚠️ Something went wrong</h1>
          <p className="text-sm text-muted-foreground break-words">
            {error.message || 'An unexpected error occurred.'}
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
