import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ImageEditorClient } from './ImageEditorClient'

export default async function ImageEditorPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return <ImageEditorClient token={token} />
}
