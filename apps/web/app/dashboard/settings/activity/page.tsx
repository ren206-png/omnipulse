import { cookies } from 'next/headers'
import { ActivityLog } from './ActivityLog'

export default async function ActivityPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <ActivityLog token={token} />
}
