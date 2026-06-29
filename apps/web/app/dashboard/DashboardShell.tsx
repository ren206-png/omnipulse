'use client'

import { useState, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ToastProvider, ToastViewport } from '@/components/ui/toast'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'

interface Workspace { id: string; name: string }

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/calendar', label: 'Calendar' },
  { href: '/dashboard/ai-calendar', label: 'AI Calendar' },
  { href: '/dashboard/queue', label: 'Queue' },
  { href: '/dashboard/approvals', label: 'Approvals' },
  { href: '/dashboard/bulk', label: 'Bulk Schedule' },
  { href: '/dashboard/history', label: 'History' },
  { href: '/dashboard/templates', label: 'Templates' },
  { href: '/dashboard/bio', label: 'Link in Bio' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/insights', label: '💡 Insights' },
  { href: '/dashboard/hashtags', label: 'Hashtags' },
  { href: '/dashboard/image-editor', label: '🖼️ Image Editor' },
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/competitors', label: 'Competitors', icon: '🔍' },
  { href: '/dashboard/trends', label: 'Trends', icon: '📈' },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/settings', label: 'Settings' },
  { href: '/dashboard/settings/branding', label: '🎨 Branding' },
  { href: '/dashboard/settings/client-portal', label: '👤 Client Portal' },
]

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <div className="flex flex-col justify-center items-center w-5 h-5 gap-1">
      <span className={cn('block h-0.5 w-5 bg-current transition-all duration-200', open && 'translate-y-1.5 rotate-45')} />
      <span className={cn('block h-0.5 w-5 bg-current transition-all duration-200', open && 'opacity-0')} />
      <span className={cn('block h-0.5 w-5 bg-current transition-all duration-200', open && '-translate-y-1.5 -rotate-45')} />
    </div>
  )
}

function WorkspaceSwitcher({ token }: { token: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { workspaces, setWorkspaces, activeWorkspace, setActiveWorkspace } = useWorkspace()
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createLoading, setCreateLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(id: string) {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return
    setActiveWorkspace(ws)
    // Soft-update URL without useSearchParams
    const url = new URL(window.location.href)
    url.searchParams.set('workspace', id)
    router.replace(`${pathname}?${url.searchParams.toString()}`)
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) { setCreateError('Name is required'); return }
    setCreateLoading(true)
    setCreateError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setCreateError(body.error ?? 'Failed to create workspace')
        return
      }
      const { workspace } = (await res.json()) as { workspace: Workspace }
      const updated = [...workspaces, workspace]
      setWorkspaces(updated)
      setActiveWorkspace(workspace)
      setCreatingWorkspace(false)
      setNewName('')
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Select value={activeWorkspace?.id ?? ''} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((w) => (
            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {creatingWorkspace ? (
        <div className="space-y-1.5">
          <Input
            ref={inputRef}
            placeholder="Workspace name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreatingWorkspace(false); setNewName('') }
            }}
            className="h-8 text-sm"
            autoFocus
          />
          {createError && <p className="text-xs text-destructive">{createError}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreate} disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create'}
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => { setCreatingWorkspace(false); setNewName('') }} disabled={createLoading}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreatingWorkspace(true)}
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-0.5 transition-colors"
        >
          + New workspace
        </button>
      )}
    </div>
  )
}

function SidebarContent({ token, onNavClick }: { token: string; onNavClick?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      <div className="p-4 border-b flex items-center justify-between">
        <span className="font-bold text-lg">OmniPulse</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell token={token} />
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_LINKS.map((link) => {
          const isActive = link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === link.href || pathname.startsWith(link.href + '/')
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavClick}
              className={cn(
                'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {(link as any).icon ? `${(link as any).icon} ${link.label}` : link.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t">
        <a href="/logout" className="block text-xs text-muted-foreground hover:text-foreground py-1 mb-2">
          Sign out
        </a>
      </div>

      <div className="p-3 border-t space-y-2">
        <p className="text-xs text-muted-foreground">Workspace</p>
        <WorkspaceSwitcher token={token} />
      </div>
    </>
  )
}

function Sidebar({ token }: { token: string }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 border-b bg-background">
        <span className="font-bold text-lg">OmniPulse</span>
        <button onClick={() => setMobileOpen(o => !o)} className="p-1.5 rounded-md hover:bg-accent transition-colors" aria-label="Toggle menu">
          <HamburgerIcon open={mobileOpen} />
        </button>
      </div>
      {mobileOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)} />}
      <aside className={cn('md:hidden fixed top-14 left-0 bottom-0 z-40 w-64 bg-background border-r flex flex-col transition-transform duration-200', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-4 py-3 border-b md:hidden">
          <span className="text-sm font-semibold text-muted-foreground">Menu</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <SidebarContent token={token} onNavClick={() => setMobileOpen(false)} />
      </aside>
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r bg-background flex-col h-screen sticky top-0">
        <SidebarContent token={token} />
      </aside>
    </>
  )
}

export function DashboardShell({
  children,
  token,
  initialWorkspaces,
}: {
  children: ReactNode
  token: string
  initialWorkspaces: Workspace[]
}) {
  return (
    <WorkspaceProvider initialWorkspaces={initialWorkspaces}>
      <ToastProvider>
        <div className="flex min-h-screen">
          <Sidebar token={token} />
          <main className="flex-1 overflow-auto p-6 pt-20 md:pt-6 md:ml-0">{children}</main>
        </div>
        <ToastViewport />
      </ToastProvider>
    </WorkspaceProvider>
  )
}
