'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Trend {
  topic: string
  momentum: 'rising' | 'hot' | 'stable'
  description: string
  contentIdeas: string[]
  suggestedHashtags: string[]
}

interface TrendResult {
  trends: Trend[]
  summary: string
}

const PLATFORMS = ['Instagram', 'TikTok', 'X', 'Facebook']

const MOMENTUM_CONFIG = {
  hot: { label: '🔥 Hot', bg: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  rising: { label: '📈 Rising', bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  stable: { label: '📊 Stable', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function getCacheKey(niche: string, platforms: string[]) {
  return `trends:${niche.toLowerCase().trim()}:${[...platforms].sort().join(',')}`
}

function loadCache(key: string): TrendResult | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: TrendResult; ts: number }
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function saveCache(key: string, data: TrendResult) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function TrendDetector() {
  const router = useRouter()
  const [niche, setNiche] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['Instagram', 'TikTok'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TrendResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  function getToken() {
    if (typeof document === 'undefined') return ''
    const match = document.cookie.match(/token=([^;]+)/)
    return match ? match[1] : ''
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  async function handleDetect(e: React.FormEvent) {
    e.preventDefault()
    if (!niche.trim() || selectedPlatforms.length === 0) return
    const cacheKey = getCacheKey(niche, selectedPlatforms)
    const cached = loadCache(cacheKey)
    if (cached) { setResult(cached); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const token = getToken()
      const res = await fetch(`${apiUrl}/api/v1/ai/trends`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim(), platforms: selectedPlatforms }),
      })
      if (!res.ok) { setError('Trend detection failed — please try again'); return }
      const data = (await res.json()) as TrendResult
      saveCache(cacheKey, data)
      setResult(data)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function copyTag(tag: string) {
    navigator.clipboard.writeText(tag).catch(() => {})
    setCopiedTag(tag)
    setTimeout(() => setCopiedTag(null), 2000)
  }

  function saveAsPostIdeas() {
    router.push('/dashboard/calendar')
  }

  return (
    <div className="space-y-6">
      {/* Search form */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <form onSubmit={handleDetect} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Your Niche</label>
            <input
              type="text"
              placeholder="e.g. fitness, personal finance, food photography"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Platforms</label>
            <div className="flex flex-wrap gap-3">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    className="rounded"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={loading || !niche.trim() || selectedPlatforms.length === 0}>
            {loading ? 'Scanning…' : 'Detect Trends'}
          </Button>
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-16">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground font-medium">Scanning trends…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {result.summary && (
            <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">This week: </span>{result.summary}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {result.trends.map((trend, i) => {
              const mConfig = MOMENTUM_CONFIG[trend.momentum] ?? MOMENTUM_CONFIG.stable
              return (
                <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-base">{trend.topic}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${mConfig.bg}`}>
                      {mConfig.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{trend.description}</p>
                  {trend.contentIdeas?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Content Ideas</p>
                      <ul className="space-y-1">
                        {trend.contentIdeas.map((idea, j) => (
                          <li key={j} className="text-sm flex gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>{idea}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {trend.suggestedHashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {trend.suggestedHashtags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => copyTag(tag)}
                          title="Click to copy"
                          className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {copiedTag === tag ? '✓ Copied' : tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={saveAsPostIdeas}>
              Save as Post Ideas →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
