import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { RepurposeClient } from './RepurposeClient'

export default async function RepurposePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Auto-Repurpose Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Turn your top-performing posts into X threads, LinkedIn carousels, tweet drafts, and Instagram captions in one click.
        </p>
      </div>
      <RepurposeClient token={token} />
    </div>
  )
}
