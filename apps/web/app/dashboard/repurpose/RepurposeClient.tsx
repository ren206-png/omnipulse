'use client'

import { useEffect, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface SuggestionPost {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string | null
  totalEngagement: number
  suggestedFormats: string[]
}

interface RepurposeResult {
  format: string
  slides: string[]
  sourcePost: { id: string; content: string }
}

const FORMAT_LABELS: Record<string, string> = {
  'x-thread': '🧵 X Thread',
  'linkedin-carousel': '📊 LinkedIn Slides',
  'tweet-drafts': '🐦 Tweet Drafts',
  'instagram-caption': '📸 Instagram',
}

export function RepurposeClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const router = useRouter()

  const [posts, setPosts] = useState<SuggestionPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState<string | null>(null)
  const [result, setResult] = useState<RepurposeResult | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!activeWorkspace) return
    setLoading(true)
    setError(null)
    fetch(`${API_URL}/api/v1/ai/repurpose/suggestions?workspaceId=${activeWorkspace.id}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load suggestions')
        const data = (await res.json()) as { posts: SuggestionPost[] }
        setPosts(data.posts)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [activeWorkspace, token])

  async function handleRepurpose(postId: string, targetFormat: string) {
    if (!activeWorkspace) return
    const key = `${postId}:${targetFormat}`
    setGeneratingKey(key)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/ai/repurpose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, postId, targetFormat }),
      })
      if (!res.ok) throw new Error('Failed to generate repurposed content')
      const data = (await res.json()) as RepurposeResult
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGeneratingKey(null)
    }
  }

  async function handleCopy(text: string, idx: number) {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  function handleScheduleAll() {
    if (!result?.slides.length) return
    const first = encodeURIComponent(result.slides[0])
    router.push(`/dashboard/calendar?content=${first}`)
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setResult(null)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold">{FORMAT_LABELS[result.format] ?? result.format}</h2>
          <span className="text-xs text-muted-foreground">from: &ldquo;{result.sourcePost.content}&rdquo;</span>
        </div>

        <div className="space-y-3">
          {result.slides.map((slide, idx) => (
            <div key={idx} className="rounded-xl border p-5 space-y-3">
              <p className="text-sm whitespace-pre-wrap">{slide}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{slide.length} chars</span>
                <button
                  onClick={() => handleCopy(slide, idx)}
                  className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-accent transition-colors"
                >
                  {copiedIdx === idx ? '✅ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleScheduleAll}
          className="w-full py-2 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          📅 Schedule All
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="text-base font-semibold">Top Posts to Repurpose</h2>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading suggestions…</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Publish some posts first to unlock repurposing suggestions.
          </p>
        )}

        {!loading && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm line-clamp-3">{post.content}</p>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    ❤️ {post.totalEngagement}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {post.platforms.map((p) => (
                    <span key={p} className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                      {p}
                    </span>
                  ))}
                  {post.scheduledFor && (
                    <span className="text-xs text-muted-foreground px-2 py-0.5">
                      {new Date(post.scheduledFor).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {post.suggestedFormats.map((fmt) => {
                    const key = `${post.id}:${fmt}`
                    const isGenerating = generatingKey === key
                    return (
                      <button
                        key={fmt}
                        onClick={() => handleRepurpose(post.id, fmt)}
                        disabled={generatingKey !== null}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            Generating…
                          </>
                        ) : (
                          FORMAT_LABELS[fmt] ?? fmt
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
