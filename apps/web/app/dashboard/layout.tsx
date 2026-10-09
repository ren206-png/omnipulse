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

  // Fetch workspaces server-side so the shell hydrates instantly with real data
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  let workspaces: Workspace[] = []
  const hiddenNav: string[] = []
  try {
    const res = await fetch(`${apiUrl}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
      // Don't cache — always fresh
      cache: 'no-store',
    })
    if (res.status === 401) {
      // Token expired — redirect to logout which clears cookie → login
      redirect('/logout')
    }
    if (res.ok) {
      const data = (await res.json()) as { workspaces?: Workspace[] }
      workspaces = data.workspaces ?? []
    }
  } catch {
    // If API is down, continue with empty workspaces (shell handles gracefully)
  }

  // Hide nav entries for features the API has switched off (their routes would 404)
  try {
    const fr = await fetch(`${apiUrl}/api/v1/features`, { cache: 'no-store' })
    if (fr.ok) {
      const f = (await fr.json()) as { approvals?: boolean; evergreen?: boolean }
      if (f.approvals === false) hiddenNav.push('/dashboard/approvals')
      if (f.evergreen === false) hiddenNav.push('/dashboard/evergreen')
    }
  } catch {
    // Features endpoint unavailable — show everything rather than hide working features
  }

  return (
    <DashboardShell token={token} initialWorkspaces={workspaces} hiddenNav={hiddenNav}>
      {children}
    </DashboardShell>
  )
}
