import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardShell } from './DashboardShell'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Workspace {
  id: string
  name: string
  plan?: string
  memberRole?: string
  _count?: { posts: number; socialAccounts: number }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  // Fetch workspaces + feature flags server-side (in parallel) so the shell hydrates instantly
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  let workspaces: Workspace[] = []
  const hiddenNav: string[] = []

  const [wsResult, featuresResult] = await Promise.allSettled([
    fetch(`${apiUrl}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
      // Don't cache — always fresh
      cache: 'no-store',
    }),
    fetch(`${apiUrl}/api/v1/features`, { cache: 'no-store' }),
  ])

  if (wsResult.status === 'fulfilled') {
    const res = wsResult.value
    if (res.status === 401) {
      // Token expired — redirect to logout which clears cookie → login.
      // (Must stay outside any try/catch: redirect() works by throwing.)
      redirect('/logout')
    }
    if (res.ok) {
      try {
        const data = (await res.json()) as { workspaces?: Workspace[] }
        workspaces = data.workspaces ?? []
      } catch {
        // Malformed body — continue with empty workspaces (shell handles gracefully)
      }
    }
  }
  // If the API is down we continue with empty workspaces (shell handles gracefully)

  // Hide nav entries for features the API has switched off (their routes would 404).
  // If the features endpoint is unavailable, show everything rather than hide working features.
  if (featuresResult.status === 'fulfilled' && featuresResult.value.ok) {
    try {
      const f = (await featuresResult.value.json()) as { approvals?: boolean; evergreen?: boolean }
      if (f.approvals === false) hiddenNav.push('/dashboard/approvals')
      if (f.evergreen === false) hiddenNav.push('/dashboard/evergreen')
    } catch {
      // ignore
    }
  }

  return (
    <DashboardShell token={token} initialWorkspaces={workspaces} hiddenNav={hiddenNav}>
      {children}
    </DashboardShell>
  )
}
