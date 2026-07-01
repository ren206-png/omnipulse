import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BrandVoiceClient } from './BrandVoiceClient'

export default async function BrandVoicePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <BrandVoiceClient token={token} />
}
