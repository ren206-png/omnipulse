import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PostHistory } from './PostHistory'

export default async function HistoryPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Post History</h1>
        <p className="text-sm text-muted-foreground mt-1">Search and browse all your posts.</p>
      </div>
      <PostHistory token={token} />
    </div>
  )
}
