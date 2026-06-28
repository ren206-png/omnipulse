import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardShell } from './DashboardShell'

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

  return (
    <DashboardShell token={token} initialWorkspaces={workspaces}>
      {children}
    </DashboardShell>
  )
}
