import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { BillingClient } from './BillingClient'

export default async function BillingPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plans</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription and unlock more features.
        </p>
      </div>
      <Suspense>
        <BillingClient token={token} />
      </Suspense>
    </div>
  )
}
