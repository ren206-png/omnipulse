import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { QueueClient } from './QueueClient'

export default async function QueuePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Smart Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Add posts to your queue and let OmniPulse schedule them at the best times automatically.</p>
      </div>
      <QueueClient token={token} />
    </div>
  )
}
