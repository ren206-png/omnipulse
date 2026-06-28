import { cookies } from 'next/headers'
import BrandingSettings from './BrandingSettings'

export default async function BrandingPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <BrandingSettings token={token} />
}
