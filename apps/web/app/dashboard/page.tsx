import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DashboardContent } from './DashboardContent'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  // Redirect new workspace owners to the onboarding wizard on first login
  if (token) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as {
          workspaces: Array<{ id: string; onboardingComplete: boolean; memberRole?: string }>
        }
        const ownerWorkspace = data.workspaces.find((w) => w.memberRole === 'OWNER')
        if (ownerWorkspace && !ownerWorkspace.onboardingComplete) {
          redirect('/dashboard/onboarding')
        }
      }
    } catch {
      // API unavailable — continue to dashboard normally
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your workspace activity.
        </p>
      </div>

      <DashboardContent token={token} />
    </div>
  )
}
