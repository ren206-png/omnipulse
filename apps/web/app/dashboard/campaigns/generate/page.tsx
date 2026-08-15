import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GenerateCampaignClient } from './GenerateCampaignClient'

export default async function GenerateCampaignPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <GenerateCampaignClient token={token} />
}
