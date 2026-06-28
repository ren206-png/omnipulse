import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { WebhooksManager } from './WebhooksManager'

export const metadata = { title: 'Webhooks — OmniPulse' }

export default async function WebhooksPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  const workspaceId = cookieStore.get('workspaceId')?.value

  if (!token || !workspaceId) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground mt-1">
          Receive real-time HTTP notifications when events happen in OmniPulse.
        </p>
      </div>
      <WebhooksManager workspaceId={workspaceId} token={token} />
    </div>
  )
}
