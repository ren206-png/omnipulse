import { cookies } from 'next/headers'
import { CalendarClientWrapper } from './CalendarClientWrapper'

export default async function CalendarPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Content Calendar</h1>
      <CalendarClientWrapper token={token} />
    </div>
  )
}
