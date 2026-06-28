import { cookies } from 'next/headers'
import { BulkClient } from './BulkClient'

export default async function BulkPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV to schedule up to 200 posts at once. Perfect for planning campaigns in advance.
        </p>
      </div>
      <BulkClient token={token} />
    </div>
  )
}
