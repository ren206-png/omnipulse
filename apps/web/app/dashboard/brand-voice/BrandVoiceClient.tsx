'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface VoiceProfile {
  tone: 'casual' | 'professional' | 'playful' | 'inspirational'
  avgLength: number
  usesEmoji: boolean
  usesHashtags: boolean
  commonPhrases: string[]
  samplePosts: string[]
}

interface BrandVoiceResponse {
  ready: boolean
  message?: string
  profile?: VoiceProfile
}

const TONE_COLORS: Record<string, string> = {
  casual: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  professional: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  playful: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  inspirational: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
}

const PLATFORMS = ['Instagram', 'X', 'LinkedIn', 'Facebook', 'TikTok']

export function BrandVoiceClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()

  // Voice profile state
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileData, setProfileData] = useState<BrandVoiceResponse | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Generator state
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [count, setCount] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [captions, setCaptions] = useState<string[]>([])
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!activeWorkspace?.id) return
    setProfileLoading(true)
    setProfileError(null)
    fetch(`${API_URL}/api/v1/ai/brand-voice?workspaceId=${activeWorkspace.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: BrandVoiceResponse) => setProfileData(data))
      .catch(() => setProfileError('Failed to load brand voice profile'))
      .finally(() => setProfileLoading(false))
  }, [activeWorkspace?.id, token])

  async function handleGenerate() {
    if (!activeWorkspace?.id || !topic.trim()) return
    setGenerating(true)
    setGenerateError(null)
    setCaptions([])
    try {
      const res = await fetch(`${API_URL}/api/v1/ai/brand-voice/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, topic, platform: platform.toUpperCase(), count }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        setGenerateError(body.message ?? 'Generation failed')
        return
      }
      const data = (await res.json()) as { captions: string[] }
      setCaptions(data.captions)
    } catch {
      setGenerateError('Network error — please try again')
    } finally {
      setGenerating(false)
    }
  }

  async function copyCaption(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brand Voice</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI analyzes your published posts to learn your style, then generates new captions that sound like you.
        </p>
      </div>

      {/* Voice Profile Card */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-lg">🎤 Your Voice Profile</h2>

        {!activeWorkspace && (
          <p className="text-muted-foreground text-sm">Select a workspace to see your voice profile.</p>
        )}

        {activeWorkspace && profileLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="animate-spin">⏳</span> Analyzing your posts…
          </div>
        )}

        {profileError && (
          <p className="text-destructive text-sm">{profileError}</p>
        )}

        {profileData && !profileData.ready && (
          <div className="text-center py-8 space-y-2">
            <p className="text-3xl">🎤</p>
            <p className="font-medium">Not enough data yet</p>
            <p className="text-muted-foreground text-sm">{profileData.message}</p>
          </div>
        )}

        {profileData?.ready && profileData.profile && (() => {
          const p = profileData.profile
          return (
            <div className="space-y-4">
              {/* Tone badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tone</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${TONE_COLORS[p.tone] ?? ''}`}>
                  {p.tone}
                </span>
              </div>

              {/* Avg length bar */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Avg post length</span>
                  <span className="font-medium">{p.avgLength} chars</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (p.avgLength / 500) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Boolean badges */}
              <div className="flex gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${p.usesEmoji ? 'border-green-400 text-green-700 dark:text-green-300' : 'border-muted text-muted-foreground'}`}>
                  {p.usesEmoji ? '✅' : '❌'} Emojis
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${p.usesHashtags ? 'border-green-400 text-green-700 dark:text-green-300' : 'border-muted text-muted-foreground'}`}>
                  {p.usesHashtags ? '✅' : '❌'} Hashtags
                </span>
              </div>

              {/* Common phrases */}
              {p.commonPhrases.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">Common phrases</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.commonPhrases.map((phrase) => (
                      <span key={phrase} className="px-2 py-0.5 bg-muted rounded-md text-xs">
                        "{phrase}"
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample posts */}
              {p.samplePosts.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">Recent samples</p>
                  <div className="space-y-1">
                    {p.samplePosts.map((post, i) => (
                      <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 leading-relaxed">
                        {post}{post.length === 100 ? '…' : ''}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Caption Generator Card */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold text-lg">✨ Caption Generator</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">What do you want to write about?</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. our new product launch, a behind-the-scenes moment…"
              className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Count</label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value={1}>1</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim() || !activeWorkspace}
            className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Analyzing your voice…
              </span>
            ) : (
              '✨ Generate in my voice'
            )}
          </button>

          {generateError && (
            <p className="text-destructive text-sm">{generateError}</p>
          )}
        </div>

        {captions.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground">Generated captions</p>
            {captions.map((caption, idx) => (
              <div key={idx} className="rounded-xl border p-4 space-y-2">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{caption}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">{caption.length} chars</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyCaption(caption, idx)}
                      className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent transition-colors"
                    >
                      {copiedIdx === idx ? '✅ Copied' : '📋 Copy'}
                    </button>
                    <Link
                      href={`/dashboard/calendar?content=${encodeURIComponent(caption)}`}
                      className="text-xs px-2.5 py-1 rounded-md border hover:bg-accent transition-colors"
                    >
                      📅 Schedule
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
