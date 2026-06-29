import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TwoFactorManager } from './TwoFactorManager'

export default async function SecuritySettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account security settings.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Two-Factor Authentication</h2>
        <TwoFactorManager token={token} />
      </div>
    </div>
  )
}
