import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { BioBuilder } from './BioBuilder'

export default async function BioPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Link in Bio</h1>
        <p className="text-sm text-muted-foreground mt-1">Create a beautiful landing page for your bio link.</p>
      </div>
      <BioBuilder token={token} />
    </div>
  )
}
