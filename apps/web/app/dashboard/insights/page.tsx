import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { InsightsClient } from './InsightsClient'

export default async function InsightsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return <InsightsClient token={token} />
}
