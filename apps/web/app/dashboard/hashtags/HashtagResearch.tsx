'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Hashtag {
  tag: string
  size: 'mega' | 'large' | 'medium' | 'niche'
  estimatedPosts: string
}

interface RecentSearch {
  topic: string
  platform: string
}

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'X', 'FACEBOOK'] as const
type Platform = (typeof PLATFORMS)[number]

const SIZE_COLORS: Record<string, string> = {
  mega:   'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  large:  'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  medium: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  niche:  'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
}

const STORAGE_KEY = 'omnipulse_hashtag_recent'

export function HashtagResearch({ token }: { token: string }) {
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState<Platform>('INSTAGRAM')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hashtags, setHashtags] = useState<Hashtag[]>([])
  const [copiedTag, setCopiedTag] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setRecentSearches(JSON.parse(stored) as RecentSearch[])
    } catch { /* ignore */ }
  }, [])

  function saveRecentSearch(t: string, p: string) {
    const next: RecentSearch[] = [
      { topic: t, platform: p },
      ...recentSearches.filter((r) => !(r.topic === t && r.platform === p)),
    ].slice(0, 5)
    setRecentSearches(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  async function handleResearch() {
    const trimmed = topic.trim()
    if (!trimmed) { setError('Enter a topic to research'); return }
    setLoading(true)
    setError(null)
    setHashtags([])
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/hashtag-research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: trimmed, platform }),
      })
      const data = (await res.json()) as { hashtags?: Hashtag[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to research hashtags'); return }
      setHashtags(data.hashtags ?? [])
      saveRecentSearch(trimmed, platform)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function copyTag(tag: string) {
    navigator.clipboard.writeText(tag).catch(() => { /* ignore */ })
    setCopiedTag(tag)
    setTimeout(() => setCopiedTag(null), 1500)
  }

  function copyAll() {
    const allTags = hashtags.map((h) => h.tag).join(' ')
    navigator.clipboard.writeText(allTags).catch(() => { /* ignore */ })
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  function applyRecent(r: RecentSearch) {
    setTopic(r.topic)
    setPlatform(r.platform as Platform)
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Topic</Label>
            <Input
              placeholder="e.g. sustainable fashion, home cooking, AI tools"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Platform</Label>
            <div className="flex gap-1.5 flex-wrap">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                    platform === p
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button onClick={handleResearch} disabled={loading || !topic.trim()}>
          {loading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              Researching…
            </>
          ) : (
            'Research Hashtags'
          )}
        </Button>

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Recent searches</p>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyRecent(r)}
                  className="text-xs px-2.5 py-1 rounded-full border bg-muted/40 hover:bg-muted transition-colors"
                >
                  {r.topic} · {r.platform}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={handleResearch}>Retry</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-8 rounded-full bg-muted animate-pulse"
                style={{ width: `${80 + (i % 4) * 20}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {hashtags.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm">{hashtags.length} hashtags for &quot;{topic}&quot; on {platform}</h2>
              <div className="flex gap-3 mt-1">
                {(['mega', 'large', 'medium', 'niche'] as const).map((s) => (
                  <span key={s} className="text-xs text-muted-foreground capitalize">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                      s === 'mega' ? 'bg-red-500' : s === 'large' ? 'bg-orange-500' : s === 'medium' ? 'bg-blue-500' : 'bg-green-500'
                    }`} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={copyAll} className="text-xs">
              {copiedAll ? '✓ Copied!' : 'Copy All'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {hashtags.map((h) => (
              <button
                key={h.tag}
                type="button"
                onClick={() => copyTag(h.tag)}
                className={`group flex flex-col items-start px-3 py-1.5 rounded-full border text-left transition-all hover:scale-105 active:scale-95 ${SIZE_COLORS[h.size] ?? SIZE_COLORS.niche}`}
                title={`Click to copy — ${h.size} · ~${h.estimatedPosts} posts`}
              >
                <span className="text-xs font-semibold leading-tight">
                  {copiedTag === h.tag ? '✓' : h.tag}
                </span>
                <span className="text-[10px] opacity-70 leading-tight">{h.estimatedPosts}</span>
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">Click any hashtag to copy it to your clipboard.</p>
        </div>
      )}
    </div>
  )
}
