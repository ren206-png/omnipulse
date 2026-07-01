import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SearchClient } from './SearchClient'

export default async function SearchPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <SearchClient token={token} />
}
