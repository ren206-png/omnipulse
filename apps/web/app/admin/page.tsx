import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AdminDashboard } from './AdminDashboard'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  // Pre-fetch stats server-side — if 403/404, user is not the admin
  const statsRes = await fetch(`${apiUrl}/api/v1/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!statsRes.ok) redirect('/dashboard')

  const stats = await statsRes.json()

  return <AdminDashboard token={token} initialStats={stats} apiUrl={apiUrl} />
}
