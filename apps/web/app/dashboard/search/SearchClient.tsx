'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspace } from '../context/WorkspaceContext'

type SearchResult = {
  type: string
  id: string
  title: string
  subtitle: string
  href: string
  icon: string
}

type FilterType = 'all' | 'posts' | 'templates' | 'media'

const TYPE_FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'posts', label: 'Posts 📝' },
  { value: 'templates', label: 'Templates 📋' },
  { value: 'media', label: 'Media 🖼️' },
]

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
      <div className="w-8 h-8 rounded bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}

export function SearchClient({ token }: { token: string }) {
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(
    async (q: string, f: FilterType) => {
      if (!q.trim() || !activeWorkspace?.id) {
        setResults([])
        setSearched(false)
        return
      }
      setLoading(true)
      setSearched(true)
      try {
        const types = f === 'all' ? 'posts,templates,media' : f
        const params = new URLSearchParams({ workspaceId: activeWorkspace.id, q: q.trim(), types })
        const res = await fetch(`${apiUrl}/api/v1/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setResults(data.results ?? [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [activeWorkspace?.id, token, apiUrl]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, filter)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, filter, doSearch])

  // Group results by type
  const grouped: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r)
  }

  const TYPE_LABELS: Record<string, string> = {
    post: 'Posts',
    template: 'Templates',
    media: 'Media',
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 pt-12 pb-24">
        {/* Header */}
        <h1 className="text-2xl font-bold mb-6">Global Search</h1>

        {/* Search input */}
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg select-none">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search posts, templates, media…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-base rounded-xl border bg-background shadow-sm outline-none focus:ring-2 focus:ring-primary/40 transition"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xl leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Type filter pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                filter === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results area */}
        <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
          {/* Empty / idle state */}
          {!query.trim() && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-base font-medium">Start typing to search</p>
              <p className="text-sm mt-1">Search across your posts, templates, and media</p>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {/* No results */}
          {!loading && searched && query.trim() && results.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <div className="text-4xl mb-3">😶</div>
              <p className="text-base font-medium">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-sm mt-2">Try a different keyword, or check your filters above.</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center text-xs">
                <span className="px-2 py-1 rounded-full bg-muted">Try shorter words</span>
                <span className="px-2 py-1 rounded-full bg-muted">Check spelling</span>
                <span className="px-2 py-1 rounded-full bg-muted">Switch to &quot;All&quot; filter</span>
              </div>
            </div>
          )}

          {/* Grouped results */}
          {!loading && results.length > 0 && (
            <div>
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-b">
                    {TYPE_LABELS[type] ?? type}
                  </div>
                  {items.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => router.push(result.href)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 text-left hover:bg-accent transition group"
                    >
                      <span className="text-xl shrink-0 leading-none">{result.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate group-hover:text-primary transition">
                          {result.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {result.subtitle}
                        </div>
                      </div>
                      <span className="text-muted-foreground group-hover:text-primary shrink-0 transition">→</span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="px-4 py-2 text-xs text-muted-foreground text-right border-t">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
