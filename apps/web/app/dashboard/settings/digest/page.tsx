import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DigestSettings } from './DigestSettings'

export default async function DigestSettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return <DigestSettings token={token} />
}
