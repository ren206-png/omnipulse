import { cookies } from 'next/headers'
import ClientPortalManager from './ClientPortalManager'

export default async function ClientPortalPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <ClientPortalManager token={token} />
}
