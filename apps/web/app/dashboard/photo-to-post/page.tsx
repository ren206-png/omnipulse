import { cookies } from 'next/headers'
import { PhotoToPostClient } from './PhotoToPostClient'

export default async function PhotoToPostPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Photo to Post</h1>
      <p className="text-sm text-muted-foreground">Upload a photo and generate platform-ready post variants in seconds.</p>
      <PhotoToPostClient token={token} />
    </div>
  )
}
