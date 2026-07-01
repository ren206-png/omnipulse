import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CampaignsClient } from './CampaignsClient'

export default async function CampaignsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <CampaignsClient token={token} />
}
