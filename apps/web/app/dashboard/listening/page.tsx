import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ListeningClient } from './ListeningClient'

export default async function ListeningPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Social Listening 👂</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track keywords and monitor mentions across all your connected social accounts.
        </p>
      </div>
      <ListeningClient token={token} />
    </div>
  )
}
