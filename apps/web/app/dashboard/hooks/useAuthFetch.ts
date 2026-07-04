'use client'

/**
 * useAuthFetch — authenticated fetch wrapper with session-expiry handling.
 *
 * Usage:
 * ```tsx
 * // In any dashboard client component that receives `token` as a prop:
 * const authFetch = useAuthFetch(token)
 *
 * // Drop-in replacement for fetch — same interface, same return value:
 * const res = await authFetch('/api/v1/posts', { method: 'GET' })
 * const data = await res.json()
 *
 * // On a 401 response the hook automatically:
 * //   1. Fires a 'session-expired' custom DOM event (DashboardShell listens)
 * //   2. Redirects to /login after 2 seconds
 * ```
 *
 * Token pattern:
 *   DashboardShell receives `token: string` from the server component (layout.tsx)
 *   and passes it down to child components. Pass that same token to useAuthFetch.
 */

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Custom DOM event dispatched when the server returns 401.
 * DashboardShell (or any global listener) can subscribe to show a toast:
 *
 * ```ts
 * window.addEventListener('session-expired', () => {
 *   // show toast, render banner, etc.
 * })
 * ```
 */
export const SESSION_EXPIRED_EVENT = 'session-expired'

export function useAuthFetch(token: string) {
  const router = useRouter()
  // Track whether we already triggered a redirect to avoid duplicate firings.
  const redirecting = useRef(false)

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      const response = await fetch(input, { ...init, headers })

      if (response.status === 401 && !redirecting.current) {
        redirecting.current = true

        // Dispatch custom event so DashboardShell (or any listener) can render
        // a toast / banner without this hook depending on a specific toast lib.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(SESSION_EXPIRED_EVENT, {
              detail: { message: 'Session expired — please sign in again' },
            }),
          )
        }

        // Give the toast 2 seconds to be visible before navigating.
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      }

      return response
    },
    [token, router],
  )

  return authFetch
}
