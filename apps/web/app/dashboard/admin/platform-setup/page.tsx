import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PlatformSetupClient } from './PlatformSetupClient'

export const metadata = { title: 'Platform Setup — OmniPulse Admin' }

export default async function PlatformSetupPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <PlatformSetupClient token={token} />
}
