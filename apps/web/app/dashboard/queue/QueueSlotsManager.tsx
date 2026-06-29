'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

interface QueueSlot {
  id: string
  dayOfWeek: number
  timeOfDay: string
  timezone: string
  platform: string | null
  isActive: boolean
}

function formatTime(t: string): string {
  const [hh, mm] = t.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const h = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${h}:${String(mm).padStart(2, '0')} ${ampm}`
}

const PLATFORM_ICONS: Record<string, string> = {
  FACEBOOK: '👤', INSTAGRAM: '📸', TIKTOK: '🎵', X: '🐦', GOOGLE: '▶️',
}

export function QueueSlotsManager({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [slots, setSlots] = useState<QueueSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tzSearch, setTzSearch] = useState('')

  // Form state
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [timeOfDay, setTimeOfDay] = useState('09:00')
  const [timezone, setTimezone] = useState('America/New_York')
  const [platform, setPlatform] = useState<string>('')

  const fetchSlots = useCallback(async (workspaceId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/queue-slots?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { slots: QueueSlot[] }
      setSlots(data.slots)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (activeWorkspace?.id) fetchSlots(activeWorkspace.id)
  }, [activeWorkspace?.id, fetchSlots])

  async function handleAdd() {
    if (!activeWorkspace?.id) return
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/queue-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          dayOfWeek,
          timeOfDay,
          timezone,
          ...(platform ? { platform } : {}),
        }),
      })
      const body = await res.json() as { slot?: QueueSlot; message?: string }
      if (!res.ok) { setError(body.message ?? 'Failed to add slot'); return }
      setSlots((prev) => [...prev, body.slot!].sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.timeOfDay.localeCompare(b.timeOfDay)
      ))
      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!activeWorkspace?.id) return
    const res = await fetch(`${API_URL}/api/v1/queue-slots/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok || res.status === 204) {
      setSlots((prev) => prev.filter((s) => s.id !== id))
    }
  }

  const filteredTz = tzSearch
    ? COMMON_TIMEZONES.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
    : COMMON_TIMEZONES

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Posting Schedule</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define recurring time slots. Use "Add to Queue" when composing to auto-assign the next open slot.
          </p>
        </div>
        <Button onClick={() => { setFormOpen((o) => !o); setError(null) }} size="sm">
          {formOpen ? 'Cancel' : '+ Add Slot'}
        </Button>
      </div>

      {/* Add form */}
      {formOpen && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">New Posting Slot</h3>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Day of week */}
            <div className="space-y-1.5">
              <Label className="text-xs">Day</Label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label className="text-xs">Time (24h)</Label>
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Platform (optional) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Platform (optional)</Label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All platforms</option>
                {['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X'].map((p) => (
                  <option key={p} value={p}>{PLATFORM_ICONS[p]} {p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Timezone</Label>
              <Input
                placeholder="Search timezone…"
                value={tzSearch || timezone}
                onChange={(e) => setTzSearch(e.target.value)}
                onFocus={() => setTzSearch('')}
                className="h-9 text-sm"
              />
              {tzSearch && (
                <div className="absolute z-20 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {filteredTz.map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onClick={() => { setTimezone(tz); setTzSearch('') }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                      {tz}
                    </button>
                  ))}
                  {filteredTz.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No match</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Selected TZ display */}
          <p className="text-xs text-muted-foreground">
            Timezone: <span className="font-medium text-foreground">{timezone}</span>
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={saving} size="sm">
              {saving ? 'Saving…' : 'Save Slot'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Slots list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No posting slots yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your first slot to start using the smart queue.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {slots.map((slot) => (
            <div key={slot.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors">
              {/* Day badge */}
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                {DAY_SHORT[slot.dayOfWeek]}
              </div>

              {/* Time + timezone */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{formatTime(slot.timeOfDay)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {slot.timezone}
                  {slot.platform && (
                    <span className="ml-2">{PLATFORM_ICONS[slot.platform]} {slot.platform.charAt(0) + slot.platform.slice(1).toLowerCase()} only</span>
                  )}
                </p>
              </div>

              {/* DAYS label */}
              <span className="text-xs text-muted-foreground hidden sm:block">
                Every {DAYS[slot.dayOfWeek]}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(slot.id)}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors text-sm px-2"
                title="Remove slot"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info callout */}
      {slots.length > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
          💡 When composing a post, click <strong className="text-foreground">Add to Queue</strong> instead of scheduling manually — it picks the next open slot automatically.
        </div>
      )}
    </div>
  )
}
