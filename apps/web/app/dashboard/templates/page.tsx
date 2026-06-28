import { cookies } from 'next/headers'
import { TemplatesClient } from './TemplatesClient'

export default async function TemplatesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reusable post templates shared across your workspace. Use <code className="bg-muted px-1 rounded text-xs">[PLACEHOLDER]</code> for variable parts.
        </p>
      </div>
      <TemplatesClient token={token} />
    </div>
  )
}
