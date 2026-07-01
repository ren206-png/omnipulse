import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { HashtagResearch } from './HashtagResearch'
import { HashtagPerformance } from './HashtagPerformance'

export default async function HashtagsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hashtags</h1>
        <p className="text-sm text-muted-foreground mt-1">Research hashtags and track which ones actually drive engagement.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HashtagPerformance token={token} />
        <HashtagResearch token={token} />
      </div>
    </div>
  )
}
