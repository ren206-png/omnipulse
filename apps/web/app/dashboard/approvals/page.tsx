import { cookies } from 'next/headers'
import { ApprovalsClient } from './ApprovalsClient'

export default async function ApprovalsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve posts submitted by your team before they go live.
        </p>
      </div>
      <ApprovalsClient token={token} />
    </div>
  )
}
