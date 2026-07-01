import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ThreadBuilderClient } from './ThreadBuilderClient'

export default async function ThreadBuilderPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <ThreadBuilderClient token={token} />
}
