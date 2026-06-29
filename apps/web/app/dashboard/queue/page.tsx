import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { QueueClient } from './QueueClient'
import { QueueSlotsManager } from './QueueSlotsManager'

export default async function QueuePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Smart Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define recurring time slots, then add posts to the queue — they&apos;ll be scheduled automatically.
        </p>
      </div>

      {/* Slot manager — define recurring posting schedule */}
      <QueueSlotsManager token={token} />

      {/* Existing queued posts */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Queued Posts</h2>
        <QueueClient token={token} />
      </div>
    </div>
  )
}
