'use client'

import { WorkspaceGuard } from '../components/WorkspaceGuard'
import { AnalyticsDashboard } from './AnalyticsDashboard'

export function AnalyticsWrapper({ token }: { token: string }) {
  return (
    <WorkspaceGuard>
      {(workspaceId) => <AnalyticsDashboard workspaceId={workspaceId} token={token} />}
    </WorkspaceGuard>
  )
}
