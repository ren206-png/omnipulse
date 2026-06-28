import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TrendDetector } from './TrendDetector'

export default async function TrendsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trend Detection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Discover what&apos;s trending in your niche and get AI-powered content ideas.
        </p>
      </div>
      <TrendDetector />
    </div>
  )
}
