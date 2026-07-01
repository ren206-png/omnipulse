import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PostAnalyticsClient } from './PostAnalyticsClient'

export default async function PostAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  const { id } = await params
  return <PostAnalyticsClient token={token} postId={id} />
}
