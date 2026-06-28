import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { HashtagResearch } from './HashtagResearch'

export default async function HashtagsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hashtag Research</h1>
        <p className="text-sm text-muted-foreground mt-1">Find the best hashtags for your content.</p>
      </div>
      <HashtagResearch token={token} />
    </div>
  )
}
