'use client'
import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'

interface Slide {
  id: string
  text: string
}

interface SocialAccount {
  id: string
  platform: string
  username?: string
  displayName?: string
}

type Platform = 'X' | 'LINKEDIN'

const CHAR_LIMITS: Record<Platform, number> = {
  X: 280,
  LINKEDIN: 700,
}

function charColor(count: number, limit: number): string {
  const ratio = count / limit
  if (ratio >= 1) return 'text-destructive font-semibold'
  if (ratio >= 0.9) return 'text-amber-500'
  return 'text-muted-foreground'
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

export function ThreadBuilderClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  const [platform, setPlatform] = useState<Platform>('X')
  const [slides, setSlides] = useState<Slide[]>([
    { id: generateId(), text: '' },
    { id: generateId(), text: '' },
  ])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [scheduledFor, setScheduledFor] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchAccounts = useCallback(async () => {
    if (!activeWorkspace?.id) return
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/social-accounts?workspaceId=${activeWorkspace.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const data = await res.json() as { accounts?: SocialAccount[] }
      const filtered = (data.accounts ?? []).filter((a) => a.platform === platform)
      setAccounts(filtered)
      setSelectedAccountId(filtered[0]?.id ?? '')
    } catch {}
  }, [activeWorkspace?.id, token, platform, apiUrl])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  function addSlide() {
    setSlides((prev) => [...prev, { id: generateId(), text: '' }])
  }

  function removeSlide(id: string) {
    setSlides((prev) => {
      if (prev.length <= 2) return prev
      return prev.filter((s) => s.id !== id)
    })
  }

  function updateSlide(id: string, text: string) {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)))
  }

  function moveUp(index: number) {
    if (index === 0) return
    setSlides((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setSlides((prev) => {
      if (index === prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!activeWorkspace?.id) { setError('No active workspace selected.'); return }
    if (!scheduledFor) { setError('Please pick a schedule date and time.'); return }
    if (slides.some((s) => !s.text.trim())) { setError('All slides must have content.'); return }

    const limit = CHAR_LIMITS[platform]
    const overLimit = slides.find((s) => s.text.length > limit)
    if (overLimit) { setError(`A slide exceeds the ${limit}-character limit for ${platform}.`); return }

    setSubmitting(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          content: slides[0].text,
          threadSlides: slides,
          platforms: [platform],
          scheduledFor: new Date(scheduledFor).toISOString(),
          status: 'SCHEDULED',
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setError(body.error ?? 'Failed to schedule thread.')
        return
      }
      showToast(`${platform === 'X' ? 'Thread' : 'Carousel'} scheduled successfully!`)
      // Reset form
      setSlides([{ id: generateId(), text: '' }, { id: generateId(), text: '' }])
      setScheduledFor('')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const limit = CHAR_LIMITS[platform]

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Thread / Carousel Builder 🧵</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Build a multi-slide thread for X or a carousel post for LinkedIn.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Platform selector */}
        <div className="rounded-xl border p-5 space-y-4">
          <p className="text-sm font-semibold">Platform</p>
          <div className="flex gap-2">
            {(['X', 'LINKEDIN'] as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPlatform(p); setSelectedAccountId('') }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors font-medium ${
                  platform === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted hover:bg-accent'
                }`}
              >
                {p === 'X' ? '🐦 X (Thread)' : '💼 LinkedIn (Carousel)'}
              </button>
            ))}
          </div>
        </div>

        {/* Slides */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Slides <span className="text-muted-foreground font-normal">({slides.length})</span>
            </p>
            <span className="text-xs text-muted-foreground">
              {platform === 'X' ? '280 chars per slide' : '700 chars per slide'}
            </span>
          </div>

          <div className="space-y-3">
            {slides.map((slide, idx) => {
              const count = slide.text.length
              const over = count > limit
              return (
                <div key={slide.id} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Slide {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="px-1.5 py-0.5 text-xs rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
                        aria-label="Move slide up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(idx)}
                        disabled={idx === slides.length - 1}
                        className="px-1.5 py-0.5 text-xs rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
                        aria-label="Move slide down"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(slide.id)}
                        disabled={slides.length <= 2}
                        className="px-2 py-0.5 text-xs rounded bg-muted hover:bg-destructive hover:text-destructive-foreground disabled:opacity-30 transition-colors"
                        aria-label="Delete slide"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={slide.text}
                    onChange={(e) => updateSlide(slide.id, e.target.value)}
                    rows={3}
                    placeholder={idx === 0 ? 'Start your thread here…' : `Slide ${idx + 1} content…`}
                    className={`w-full text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-1 focus:ring-ring resize-none ${
                      over ? 'border-destructive' : ''
                    }`}
                  />

                  <div className="flex justify-end">
                    <span className={`text-xs ${charColor(count, limit)}`}>
                      {count} / {limit}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={addSlide}
            className="w-full py-2 text-sm border-2 border-dashed rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            + Add Slide
          </button>
        </div>

        {/* Account selector */}
        <div className="rounded-xl border p-5 space-y-4">
          <p className="text-sm font-semibold">Platform Account</p>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {platform} accounts connected.{' '}
              <a href="/dashboard/accounts" className="underline text-primary">Connect one</a>.
            </p>
          ) : (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-1 focus:ring-ring"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName ?? a.username ?? a.id} ({a.platform})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Schedule */}
        <div className="rounded-xl border p-5 space-y-4">
          <p className="text-sm font-semibold">Schedule</p>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting
            ? 'Scheduling…'
            : `Schedule ${platform === 'X' ? 'Thread' : 'Carousel'} (${slides.length} slides)`}
        </button>
      </form>
    </div>
  )
}
