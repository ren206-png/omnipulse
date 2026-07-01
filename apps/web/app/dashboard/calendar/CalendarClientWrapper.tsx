'use client'

import { Suspense } from 'react'
import { WorkspaceGuard } from '../components/WorkspaceGuard'
import { CalendarClient } from './CalendarClient'

export function CalendarClientWrapper({ token }: { token: string }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse bg-muted rounded-xl" />}>
      <WorkspaceGuard>
        {(workspaceId) => <CalendarClient workspaceId={workspaceId} token={token} />}
      </WorkspaceGuard>
    </Suspense>
  )
}
