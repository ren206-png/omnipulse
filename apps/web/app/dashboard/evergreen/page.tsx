import { cookies } from 'next/headers'
import { EvergreenClient } from './EvergreenClient'

export default async function EvergreenPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Evergreen Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Posts in the evergreen queue are automatically recycled on a schedule.
        </p>
      </div>
      <EvergreenClient token={token} />
    </div>
  )
}
