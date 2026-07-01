import { cookies } from 'next/headers'
import { BulkImportClient } from './BulkImportClient'

export default async function BulkImportPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk CSV Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV file to schedule multiple posts at once across platforms.
        </p>
      </div>
      <BulkImportClient token={token} />
    </div>
  )
}
