'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface Workspace {
  id: string
  name: string
}

interface WorkspaceContextValue {
  activeWorkspace: Workspace | null
  setActiveWorkspace: (w: Workspace) => void
  workspaces: Workspace[]
  setWorkspaces: (ws: Workspace[]) => void
  workspacesLoading: boolean
  setWorkspacesLoading: (v: boolean) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  children,
  initialWorkspaces = [],
}: {
  children: ReactNode
  initialWorkspaces?: Workspace[]
}) {
  // Auto-select the first workspace immediately — no async needed
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(
    initialWorkspaces[0] ?? null,
  )
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces)
  // workspacesLoading is always false when data comes from the server layout
  const [workspacesLoading, setWorkspacesLoading] = useState(false)

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        setActiveWorkspace,
        workspaces,
        setWorkspaces,
        workspacesLoading,
        setWorkspacesLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
