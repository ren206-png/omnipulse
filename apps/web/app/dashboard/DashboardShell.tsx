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
import { CommandPalette } from './components/CommandPalette'

interface Workspace { id: string; name: string }

const NAV_GROUPS = [
  {
    label: 'Publish',
    defaultOpen: true,
    links: [
      { href: '/dashboard/calendar', label: 'Calendar', icon: '📅' },
      { href: '/dashboard/ai-calendar', label: 'AI Calendar', icon: '🤖' },
      { href: '/dashboard/queue', label: 'Queue', icon: '📋' },
      { href: '/dashboard/bulk', label: 'Bulk Schedule', icon: '📤' },
      { href: '/dashboard/bulk-import', label: 'Bulk Import', icon: '📥' },
    ],
  },
  {
    label: 'Manage',
    defaultOpen: true,
    links: [
      { href: '/dashboard/approvals', label: 'Approvals', icon: '✅' },
      { href: '/dashboard/history', label: 'History', icon: '📜' },
      { href: '/dashboard/templates', label: 'Templates', icon: '📝' },
      { href: '/dashboard/campaigns', label: 'Campaigns', icon: '🏷️' },
      { href: '/dashboard/ab-test', label: 'A/B Tests', icon: '🧪' },
      { href: '/dashboard/inbox', label: 'Inbox', icon: '📬' },
    ],
  },
  {
    label: 'Insights',
    defaultOpen: false,
    links: [
      { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
      { href: '/dashboard/insights', label: 'Insights', icon: '💡' },
      { href: '/dashboard/content-health', label: 'Content Health', icon: '❤️' },
      { href: '/dashboard/competitors', label: 'Competitors', icon: '🔍' },
      { href: '/dashboard/trends', label: 'Trends', icon: '📈' },
      { href: '/dashboard/hashtags', label: 'Hashtags', icon: '#️⃣' },
    ],
  },
  {
    label: 'Tools',
    defaultOpen: false,
    links: [
      { href: '/dashboard/image-editor', label: 'Image Editor', icon: '🖼️' },
      { href: '/dashboard/media', label: 'Media Library', icon: '🖼️' },
      { href: '/dashboard/bio', label: 'Link in Bio', icon: '🔗' },
      { href: '/dashboard/links', label: 'Link Shortener', icon: '🔗' },
      { href: '/dashboard/thread-builder', label: 'Thread Builder', icon: '🧵' },
      { href: '/dashboard/listening', label: 'Social Listening', icon: '👂' },
      { href: '/dashboard/brand-voice', label: 'Brand Voice', icon: '🎤' },
      { href: '/dashboard/repurpose', label: 'Repurpose', icon: '♻️' },
    ],
  },
  {
    label: 'Settings',
    defaultOpen: false,
    links: [
      { href: '/dashboard/accounts', label: 'Accounts', icon: '🔌' },
      { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
      { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
      { href: '/dashboard/settings/branding', label: 'Branding', icon: '🎨' },
      { href: '/dashboard/settings/client-portal', label: 'Client Portal', icon: '👤' },
    ],
  },
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

function SidebarContent({ token, onNavClick, onOpenCmd }: { token: string; onNavClick?: () => void; onOpenCmd?: () => void }) {
  const pathname = usePathname()

  const initialOpen = NAV_GROUPS.reduce<Record<string, boolean>>((acc, group) => {
    acc[group.label] = group.defaultOpen
    return acc
  }, {})

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen)

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <>
      <div className="p-4 border-b flex items-center justify-between">
        <span className="font-bold text-lg">OmniPulse</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell token={token} />
          <button
            onClick={onOpenCmd}
            className="hidden md:flex items-center gap-1 text-xs text-muted-foreground border rounded px-2 py-1 hover:bg-accent transition-colors"
            aria-label="Open command palette"
          >
            ⌘K
          </button>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {/* Dashboard home link */}
        <Link
          href="/dashboard"
          onClick={onNavClick}
          className={cn(
            'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname === '/dashboard'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent hover:text-accent-foreground',
          )}
        >
          🏠 Dashboard
        </Link>

        {/* New Post button */}
        <Link
          href="/dashboard/calendar?new=1"
          onClick={onNavClick}
          className="flex items-center gap-2 mx-3 mt-1 mb-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          ✍️ New Post
        </Link>

        {/* Grouped nav */}
        <div className="mt-2 space-y-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
              >
                <span>{group.label}</span>
                <span>{openGroups[group.label] ? '▾' : '▸'}</span>
              </button>

              {openGroups[group.label] && (
                <div className="mt-0.5 space-y-0.5">
                  {group.links.map((link) => {
                    const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={onNavClick}
                        className={cn(
                          'flex items-center gap-2 pl-5 pr-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <span>{link.icon}</span>
                        <span>{link.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
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

function Sidebar({ token, onOpenCmd }: { token: string; onOpenCmd: () => void }) {
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
        <SidebarContent token={token} onNavClick={() => setMobileOpen(false)} onOpenCmd={onOpenCmd} />
      </aside>
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r bg-background flex-col h-screen sticky top-0">
        <SidebarContent token={token} onOpenCmd={onOpenCmd} />
      </aside>
    </>
  )
}

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅' },
  { href: '/dashboard/calendar?new=1', label: 'Post', icon: '✍️' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: '📬' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
]

function MobileBottomNav() {
  const pathname = usePathname()
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-end border-t bg-background/80 backdrop-blur-md">
      {MOBILE_NAV.map((item) => {
        const isPost = item.label === 'Post'
        const isActive = !isPost && (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0])))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-end pb-2 pt-1 gap-0.5 text-[10px] font-medium transition-colors relative',
              isPost ? 'mb-1' : '',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isPost ? (
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground text-xl shadow-lg -mt-5 mb-0.5">
                {item.icon}
              </span>
            ) : (
              <span className="text-xl leading-none">{item.icon}</span>
            )}
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
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
  const [cmdOpen, setCmdOpen] = useState(false)
  return (
    <WorkspaceProvider initialWorkspaces={initialWorkspaces}>
      <ToastProvider>
        <div className="flex min-h-screen">
          <Sidebar token={token} onOpenCmd={() => setCmdOpen(true)} />
          <main className="flex-1 overflow-auto p-6 pt-20 pb-20 md:pt-6 md:pb-6 md:ml-0">{children}</main>
        </div>
        <MobileBottomNav />
        <ToastViewport />
        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} token={token} />
      </ToastProvider>
    </WorkspaceProvider>
  )
}
