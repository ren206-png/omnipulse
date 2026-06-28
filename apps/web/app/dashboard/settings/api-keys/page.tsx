import { cookies } from 'next/headers'
import { ApiKeysManager } from './ApiKeysManager'

export default async function ApiKeysPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  return <ApiKeysManager token={token} />
}
