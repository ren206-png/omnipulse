'use client'

import { WorkspaceGuard } from '../components/WorkspaceGuard'
import { CalendarClient } from './CalendarClient'

export function CalendarClientWrapper({ token }: { token: string }) {
  return (
    <WorkspaceGuard>
      {(workspaceId) => <CalendarClient workspaceId={workspaceId} token={token} />}
    </WorkspaceGuard>
  )
}
