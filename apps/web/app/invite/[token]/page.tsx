import { cookies } from 'next/headers'
import { InviteClient } from './InviteClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token: inviteToken } = await params
  const cookieStore = await cookies()
  const authToken = cookieStore.get('token')?.value ?? ''

  return <InviteClient inviteToken={inviteToken} authToken={authToken} />
}
