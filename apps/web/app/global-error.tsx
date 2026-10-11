'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Catches errors thrown in the root layout, which app/error.tsx cannot.
export default function RootError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
            We have been notified. Please try again in a moment.
          </p>
          <a href="/" style={{ fontSize: 14 }}>Go home</a>
        </div>
      </body>
    </html>
  )
}
