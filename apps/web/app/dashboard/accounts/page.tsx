import { cookies } from 'next/headers'
import { AccountsClient } from './AccountsClient'

export default async function AccountsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Social Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect and manage the social accounts used for publishing.
        </p>
      </div>
      <AccountsClient token={token} />
    </div>
  )
}
