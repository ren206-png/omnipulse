import { cookies } from 'next/headers'
import { TeamClient } from './TeamClient'
import { redirect } from 'next/navigation'

function decodeJwtPayload(token: string): { id: string; email: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return { id: payload.id, email: payload.email }
  } catch {
    return null
  }
}

interface SearchParams {
  workspaceId?: string
}

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  const { workspaceId } = await searchParams
  if (!workspaceId) redirect('/dashboard')

  const user = decodeJwtPayload(token)
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage who has access to this workspace and their permissions.
        </p>
      </div>
      <TeamClient workspaceId={workspaceId} token={token} currentUserId={user.id} />
    </div>
  )
}
