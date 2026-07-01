import { cookies } from 'next/headers'
import { ClientPortalSettings } from './ClientPortalSettings'

export default async function ClientPortalPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Client Approval Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Share a private link with your client so they can approve or reject scheduled posts — no login required.
        </p>
      </div>
      <ClientPortalSettings token={token} />
    </div>
  )
}
