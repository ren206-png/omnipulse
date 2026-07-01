import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LinksClient } from './LinksClient'

export default async function LinksPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Link Shortener 🔗</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Shorten URLs, auto-inject UTM parameters, and track clicks per link.
        </p>
      </div>
      <LinksClient token={token} />
    </div>
  )
}
