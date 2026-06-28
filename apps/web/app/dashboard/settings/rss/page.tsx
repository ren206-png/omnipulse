import { cookies } from 'next/headers'
import { RssFeeds } from './RssFeeds'

export default async function RssFeedsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <RssFeeds token={token} />
}
