'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

interface Props { token: string }

const TYPE_ICON: Record<string, string> = {
  POST_PUBLISHED:        '🎉',
  POST_FAILED:           '❌',
  POST_SUBMITTED_REVIEW: '👀',
  POST_APPROVED:         '✅',
  POST_REJECTED:         '↩️',
  MEMBER_JOINED:         '👋',
  INVITATION_SENT:       '📧',
}

export function NotificationBell({ token }: Props) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/notifications?limit=20`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = (await res.json()) as { notifications: Notification[]; unreadCount: number }
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch { /* silent */ }
  }, [token])

  // Initial fetch + SSE for real-time updates
  useEffect(() => {
    if (!token) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

    // Load existing notifications on mount
    fetchNotifications()

    // SSE for real-time updates
    const url = `${apiUrl}/api/v1/notifications/stream`
    let es: EventSource | null = null

    function connect() {
      // EventSource doesn't support custom headers — pass token as query param
      es = new EventSource(`${url}?token=${token}`)

      es.addEventListener('notification', (e: MessageEvent) => {
        try {
          const notif = JSON.parse(e.data as string) as Notification
          setNotifications((prev) => {
            if (prev.find((n) => n.id === notif.id)) return prev
            return [notif, ...prev]
          })
          if (!notif.read) setUnreadCount((c) => c + 1)
        } catch { /* ignore malformed events */ }
      })

      es.onerror = () => {
        es?.close()
        // Reconnect after 5s
        setTimeout(connect, 5000)
      }
    }

    connect()

    return () => { es?.close() }
  }, [token]) // fetchNotifications is stable via useCallback

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch(`${apiUrl}/api/v1/notifications/${id}/read`, { method: 'PATCH', headers })
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    await fetch(`${apiUrl}/api/v1/notifications/read-all`, { method: 'POST', headers })
  }

  async function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const wasUnread = notifications.find((n) => n.id === id)?.read === false
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1))
    await fetch(`${apiUrl}/api/v1/notifications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id)
    if (n.link) window.location.href = n.link
    setOpen(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          const opening = !open
          setOpen(opening)
          if (opening) {
            fetchNotifications()
            fetch(`${apiUrl}/api/v1/notifications/read-all`, { method: 'POST', headers })
              .then(() => {
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                setUnreadCount(0)
              })
              .catch(() => { /* silent */ })
          }
        }}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-xl border bg-background shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group',
                    !n.read && 'bg-primary/5',
                  )}
                >
                  <button
                    className="flex gap-3 flex-1 text-left min-w-0"
                    onClick={() => handleNotificationClick(n)}
                  >
                    <span className="text-base shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={cn('text-xs font-medium leading-snug', !n.read && 'text-foreground')}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteNotification(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 self-start mt-0.5"
                    aria-label="Dismiss"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
