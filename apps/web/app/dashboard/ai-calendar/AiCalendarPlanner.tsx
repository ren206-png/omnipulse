'use client'

import { useState, useCallback } from 'react'
import { addDays, nextMonday } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

const TONES = ['Casual', 'Professional', 'Inspiring', 'Educational', 'Fun'] as const
const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'X', 'FACEBOOK'] as const
const DURATIONS = [{ label: '1 week', weeks: 1 }, { label: '2 weeks', weeks: 2 }, { label: '4 weeks', weeks: 4 }]

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  FACEBOOK: 'bg-blue-100 text-blue-700',
}

const TYPE_COLORS: Record<string, string> = {
  'Educational': 'bg-blue-50 text-blue-600',
  'Promotional': 'bg-purple-50 text-purple-600',
  'Behind the Scenes': 'bg-amber-50 text-amber-600',
  'User Generated Content': 'bg-green-50 text-green-600',
  'Trending': 'bg-red-50 text-red-600',
}

const LOADING_MESSAGES = [
  'Analyzing your niche…',
  'Crafting scroll-stopping hooks…',
  'Building your content mix…',
  'Optimizing posting schedule…',
  'Finalizing your calendar…',
]

interface CalendarPost {
  week: number
  day: number
  platform: string
  type: string
  hook: string
  content: string
}

export function AiCalendarPlanner({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const [niche, setNiche] = useState('')
  const [tone, setTone] = useState<string>('Casual')
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM', 'X'])
  const [weeks, setWeeks] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)
  const [plan, setPlan] = useState<CalendarPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [scheduled, setScheduled] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const generate = useCallback(async () => {
    if (!niche.trim() || platforms.length === 0) return
    setLoading(true)
    setPlan([])
    setError(null)
    setScheduled(new Set())
    const interval = setInterval(() => setLoadingMsg(m => (m + 1) % LOADING_MESSAGES.length), 1200)
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/content-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId: activeWorkspace?.id, niche: niche.trim(), tone, platforms, weeks }),
      })
      const data = await res.json() as { plan?: CalendarPost[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Generation failed')
        return
      }
      setPlan(data.plan ?? [])
    } catch {
      setError('Network error — please try again')
    } finally {
      clearInterval(interval)
      setLoading(false)
    }
  }, [niche, tone, platforms, weeks, token, activeWorkspace, apiUrl])

  async function schedulePost(post: CalendarPost, key: string) {
    if (!activeWorkspace) return
    setScheduling(key)
    const monday = nextMonday(new Date())
    const postDate = addDays(monday, (post.week - 1) * 7 + post.day - 1)
    postDate.setHours(10, 0, 0, 0)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          content: post.content,
          platforms: [post.platform],
          scheduledFor: postDate.toISOString(),
          status: 'DRAFT',
        }),
      })
      if (res.ok) {
        setScheduled(s => new Set([...s, key]))
        showToast('Post saved as draft!')
      } else {
        showToast('Failed to schedule post')
      }
    } catch {
      showToast('Network error')
    } finally {
      setScheduling(null)
    }
  }

  async function scheduleAll() {
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i]
      const key = `${p.week}-${p.day}-${p.platform}-${i}`
      if (!scheduled.has(key)) await schedulePost(p, key)
    }
    showToast(`${plan.length} posts saved as drafts!`)
  }

  const grouped = plan.reduce<Record<number, CalendarPost[]>>((acc, p) => {
    if (!acc[p.week]) acc[p.week] = []
    acc[p.week].push(p)
    return acc
  }, {})

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Config card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div className="space-y-1.5">
          <Label>Your niche / brand</Label>
          <Input
            placeholder="e.g. fitness coach, SaaS startup, restaurant, fashion brand"
            value={niche}
            onChange={e => setNiche(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tone</Label>
          <div className="flex flex-wrap gap-2">
            {TONES.map(t => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  tone === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-foreground/30',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Platforms</Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  platforms.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-foreground/30',
                )}
              >
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Duration</Label>
          <div className="flex gap-2">
            {DURATIONS.map(d => (
              <button
                key={d.weeks}
                onClick={() => setWeeks(d.weeks)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  weeks === d.weeks ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-foreground/30',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={generate}
          disabled={loading || !niche.trim() || platforms.length === 0}
          className="w-full"
        >
          {loading ? `✨ ${LOADING_MESSAGES[loadingMsg]}` : '🗓 Generate Calendar'}
        </Button>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
        )}
      </div>

      {/* Results */}
      {plan.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{plan.length} posts generated</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generate}>↺ Regenerate</Button>
              <Button size="sm" onClick={scheduleAll}>📥 Save All as Drafts</Button>
            </div>
          </div>

          {Object.entries(grouped).map(([week, posts]) => (
            <div key={week} className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Week {week}
              </h3>
              <div className="space-y-2">
                {posts.map((post, i) => {
                  const key = `${post.week}-${post.day}-${post.platform}-${i}`
                  const isScheduled = scheduled.has(key)
                  return (
                    <div
                      key={key}
                      className={cn('rounded-lg border bg-card p-4 space-y-2', isScheduled && 'opacity-60')}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground w-8">
                          {dayNames[post.day - 1] ?? `D${post.day}`}
                        </span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PLATFORM_COLORS[post.platform] ?? 'bg-muted text-muted-foreground')}>
                          {post.platform}
                        </span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[post.type] ?? 'bg-muted text-muted-foreground')}>
                          {post.type}
                        </span>
                        <div className="ml-auto">
                          <Button
                            size="sm"
                            variant={isScheduled ? 'outline' : 'default'}
                            className="h-6 text-xs"
                            disabled={isScheduled || scheduling === key}
                            onClick={() => schedulePost(post, key)}
                          >
                            {isScheduled ? '✓ Saved' : scheduling === key ? 'Saving…' : 'Save Draft'}
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm font-medium leading-snug">{post.hook}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
