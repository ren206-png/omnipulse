import { cookies } from 'next/headers'
import { ContentHealthClient } from './ContentHealthClient'

export default async function ContentHealthPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <ContentHealthClient token={token} />
}
