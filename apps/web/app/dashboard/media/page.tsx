import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MediaLibraryClient } from './MediaLibraryClient'

export default async function MediaPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <MediaLibraryClient token={token} />
}
