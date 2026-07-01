import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NotificationPreferences } from './NotificationPreferences'

export default async function NotificationPreferencesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return <NotificationPreferences token={token} />
}
