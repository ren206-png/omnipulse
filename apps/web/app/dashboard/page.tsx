import { cookies } from 'next/headers'
import { DashboardContent } from './DashboardContent'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

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
