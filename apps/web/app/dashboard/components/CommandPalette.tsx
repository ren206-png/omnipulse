'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type NavItem = {
  type: 'nav'
  label: string
  href: string
  icon: string
}

type ActionItem = {
  type: 'action'
  label: string
  action: string
  icon: string
  description: string
  href: string
}

type Item = NavItem | ActionItem

const NAV_ITEMS: NavItem[] = [
  { type: 'nav', label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { type: 'nav', label: 'Calendar', href: '/dashboard/calendar', icon: '📅' },
  { type: 'nav', label: 'AI Calendar', href: '/dashboard/ai-calendar', icon: '🤖' },
  { type: 'nav', label: 'Queue', href: '/dashboard/queue', icon: '📋' },
  { type: 'nav', label: 'Approvals', href: '/dashboard/approvals', icon: '✅' },
  { type: 'nav', label: 'History', href: '/dashboard/history', icon: '📜' },
  { type: 'nav', label: 'Templates', href: '/dashboard/templates', icon: '📝' },
  { type: 'nav', label: 'Bulk Import', href: '/dashboard/bulk-import', icon: '📥' },
  { type: 'nav', label: 'Link in Bio', href: '/dashboard/bio', icon: '🔗' },
  { type: 'nav', label: 'Analytics', href: '/dashboard/analytics', icon: '📊' },
  { type: 'nav', label: 'Insights', href: '/dashboard/insights', icon: '💡' },
  { type: 'nav', label: 'Hashtag Research', href: '/dashboard/hashtags', icon: '#️⃣' },
  { type: 'nav', label: 'Image Editor', href: '/dashboard/image-editor', icon: '🖼️' },
  { type: 'nav', label: 'Inbox', href: '/dashboard/inbox', icon: '📬' },
  { type: 'nav', label: 'Competitors', href: '/dashboard/competitors', icon: '🔍' },
  { type: 'nav', label: 'Trends', href: '/dashboard/trends', icon: '📈' },
  { type: 'nav', label: 'Accounts', href: '/dashboard/accounts', icon: '🔌' },
  { type: 'nav', label: 'Content Health', href: '/dashboard/content-health', icon: '❤️' },
  { type: 'nav', label: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
  { type: 'nav', label: 'Branding', href: '/dashboard/settings/branding', icon: '🎨' },
  { type: 'nav', label: 'Billing', href: '/dashboard/billing', icon: '💳' },
]

const ACTION_ITEMS: ActionItem[] = [
  { type: 'action', label: 'New Post', action: 'new-post', icon: '✍️', description: 'Open post composer', href: '/dashboard/queue' },
  { type: 'action', label: 'Bulk Import CSV', action: 'bulk-import', icon: '📥', description: 'Import posts from CSV', href: '/dashboard/bulk-import' },
  { type: 'action', label: 'View Analytics', action: 'analytics', icon: '📊', description: 'See performance metrics', href: '/dashboard/analytics' },
]

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Global keyboard listener for ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange])

  // Focus input when opened, reset state on close
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Defer focus so the DOM is visible
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const q = query.toLowerCase().trim()

  const filteredNav = NAV_ITEMS.filter((item) =>
    !q || item.label.toLowerCase().includes(q)
  )

  const filteredActions = ACTION_ITEMS.filter((item) =>
    !q || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
  )

  const allItems: Item[] = [...filteredActions, ...filteredNav]

  const navigate = useCallback(
    (item: Item) => {
      router.push(item.href)
      onOpenChange(false)
    },
    [router, onOpenChange]
  )

  // Keyboard navigation inside palette
  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = allItems[selectedIndex]
        if (item) navigate(item)
        return
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, allItems, selectedIndex, navigate, onOpenChange])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector('[data-selected="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  let globalIndex = 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="fixed left-1/2 top-[20%] -translate-x-1/2 z-50 w-full max-w-lg bg-background border rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 text-base border-b bg-transparent outline-none"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {allItems.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {filteredActions.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Actions
              </div>
              {filteredActions.map((item) => {
                const idx = globalIndex++
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.action}
                    data-selected={isSelected}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm${isSelected ? ' bg-accent' : ''}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filteredNav.length > 0 && (
            <div>
              <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Navigation
              </div>
              {filteredNav.map((item) => {
                const idx = globalIndex++
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.href}
                    data-selected={isSelected}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm${isSelected ? ' bg-accent' : ''}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t text-xs text-muted-foreground flex gap-4">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  )
}
