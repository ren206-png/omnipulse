import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from './OnboardingWizard'

export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  return <OnboardingWizard token={token} />
}
