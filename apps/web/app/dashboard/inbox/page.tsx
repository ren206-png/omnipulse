import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { InboxClient } from './InboxClient'

export default async function InboxPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Social Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Comments, mentions, and DMs from all your connected platforms in one place.</p>
      </div>
      <InboxClient token={token} />
    </div>
  )
}
