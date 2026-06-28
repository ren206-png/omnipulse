import { cookies } from 'next/headers'
import { AnalyticsWrapper } from './AnalyticsWrapper'

export default async function AnalyticsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <AnalyticsWrapper token={token} />
    </div>
  )
}
