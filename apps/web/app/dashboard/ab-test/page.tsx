import { cookies } from 'next/headers'
import AbTestClient from './AbTestClient'

export default async function AbTestPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <AbTestClient token={token} />
}
