import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CompetitorTracker } from './CompetitorTracker'

export default async function CompetitorsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Competitor Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your competitors&apos; follower growth and engagement rates.
        </p>
      </div>
      <CompetitorTracker />
    </div>
  )
}
