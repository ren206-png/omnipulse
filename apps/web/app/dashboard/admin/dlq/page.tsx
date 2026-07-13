import { cookies } from 'next/headers'
import { DlqClient } from './DlqClient'

export default async function DlqPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Failed Posts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Posts that failed to publish. Retry or resolve them here.
        </p>
      </div>
      <DlqClient token={token} />
    </div>
  )
}
