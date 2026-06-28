import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AiCalendarPlanner } from './AiCalendarPlanner'

export default async function AiCalendarPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) redirect('/login')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Content Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">Let AI plan your entire content calendar in seconds.</p>
      </div>
      <AiCalendarPlanner token={token} />
    </div>
  )
}
