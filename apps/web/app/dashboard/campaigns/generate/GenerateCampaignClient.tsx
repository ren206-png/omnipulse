'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORMS = ['INSTAGRAM', 'X', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'YOUTUBE'] as const
type Platform = (typeof PLATFORMS)[number]

const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: '📸 Instagram',
  X: '𝕏 X',
  FACEBOOK: '👥 Facebook',
  TIKTOK: '🎵 TikTok',
  LINKEDIN: '💼 LinkedIn',
  YOUTUBE: '▶️ YouTube',
}

const TONES = ['professional', 'casual', 'inspirational', 'educational', 'humorous', 'bold'] as const
type Tone = (typeof TONES)[number]

const TONE_LABELS: Record<Tone, string> = {
  professional: '💼 Professional',
  casual: '😊 Casual',
  inspirational: '✨ Inspirational',
  educational: '📚 Educational',
  humorous: '😄 Humorous',
  bold: '🔥 Bold',
}

interface GeneratedPost {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string
  status: string
  type: string
  hook: string
}

interface GenerateResult {
  campaign: { id: string; name: string; color: string }
  summary: string
  posts: GeneratedPost[]
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const TYPE_COLORS: Record<string, string> = {
  Educational: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Promotional: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Behind-the-scenes': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Engagement: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Story: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  Tips: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Case Study': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}
const DEFAULT_TYPE_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'

export function GenerateCampaignClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id ?? ''

  // Form state
  const [topic, setTopic] = useState('')
  const [goal, setGoal] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['INSTAGRAM', 'X'])
  const [durationDays, setDurationDays] = useState(14)
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [tone, setTone] = useState<Tone>('professional')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)

  // Expanded post preview
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p],
    )
  }

  const totalPosts = Math.max(1, Math.round((durationDays / 7) * postsPerWeek))

  async function handleGenerate() {
    if (!topic.trim()) { setError('Please enter a topic or niche'); return }
    if (!workspaceId) { setError('No active workspace — please select one'); return }
    setGenerating(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/ai/campaign/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId,
          topic,
          goal,
          platforms: selectedPlatforms,
          durationDays,
          postsPerWeek,
          tone,
          campaignName: campaignName || undefined,
          startDate,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { message?: string }).message ?? 'Generation failed — please try again')
        return
      }
      setResult(body as GenerateResult)
    } catch {
      setError('Network error — please try again')
    } finally {
      setGenerating(false)
    }
  }

  if (result) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Success header */}
        <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🎉</span>
                <h1 className="text-xl font-bold">Campaign Generated!</h1>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">{result.summary}</p>
            </div>
            <div
              className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: result.campaign.color }}
            >
              {result.campaign.name}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              <strong>{result.posts.length} posts</strong> scheduled and ready
            </span>
            <span className="text-muted-foreground">·</span>
            <Link
              href={`/dashboard/calendar?campaignId=${result.campaign.id}`}
              className="text-indigo-600 hover:underline font-medium"
            >
              View in Calendar →
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              href="/dashboard/campaigns"
              className="text-indigo-600 hover:underline font-medium"
            >
              All Campaigns →
            </Link>
          </div>
        </div>

        {/* Post list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Scheduled Posts
          </h2>
          {result.posts.map((post) => (
            <div
              key={post.id}
              className="rounded-xl border bg-card overflow-hidden"
            >
              <button
                className="w-full text-left p-4 flex items-start gap-3 hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        TYPE_COLORS[post.type] ?? DEFAULT_TYPE_COLOR
                      }`}
                    >
                      {post.type}
                    </span>
                    <span className="text-xs text-muted-foreground">{post.platforms.join(', ')}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDateTime(post.scheduledFor)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{post.hook || post.content.slice(0, 80)}</p>
                </div>
                <span className="text-muted-foreground text-xs mt-1 shrink-0">
                  {expandedId === post.id ? '▲' : '▼'}
                </span>
              </button>

              {expandedId === post.id && (
                <div className="px-4 pb-4 border-t bg-muted/20">
                  <pre className="text-sm whitespace-pre-wrap font-sans mt-3 leading-relaxed">
                    {post.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Generate another */}
        <div className="pt-2">
          <Button
            variant="outline"
            onClick={() => { setResult(null); setTopic(''); setGoal(''); setCampaignName('') }}
          >
            ← Generate Another Campaign
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/campaigns" className="text-muted-foreground hover:text-foreground text-sm">
          ← Campaigns
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold">AI Campaign Generator 🤖</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Describe your topic and goal — AI will generate a full multi-post campaign and schedule it automatically.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border bg-card p-6 space-y-5">

        {/* Topic */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Topic / Niche <span className="text-destructive">*</span></label>
          <Input
            placeholder="e.g. Sustainable fashion for Gen Z, SaaS product launch, Personal finance tips"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        {/* Goal */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Campaign Goal</label>
          <Input
            placeholder="e.g. Grow followers, Drive sign-ups, Promote a sale, Build brand awareness"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>

        {/* Campaign Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Campaign Name <span className="text-muted-foreground text-xs">(optional)</span></label>
          <Input
            placeholder="Auto-generated if left blank"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>

        {/* Platforms */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Platforms</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedPlatforms.includes(p)
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-600'
                    : 'border-border hover:bg-accent text-muted-foreground'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tone</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  tone === t
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-600'
                    : 'border-border hover:bg-accent text-muted-foreground'
                }`}
              >
                {TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Duration + frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Duration</label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={7}>1 week (7 days)</option>
              <option value={14}>2 weeks (14 days)</option>
              <option value={21}>3 weeks (21 days)</option>
              <option value={30}>1 month (30 days)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Posts per week</label>
            <select
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={1}>1 post</option>
              <option value={2}>2 posts</option>
              <option value={3}>3 posts</option>
              <option value={5}>5 posts</option>
              <option value={7}>7 posts (daily)</option>
            </select>
          </div>
        </div>

        {/* Start date */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Start Date</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          Will generate <strong className="text-foreground">{totalPosts} posts</strong> across{' '}
          <strong className="text-foreground">{durationDays} days</strong> on{' '}
          <strong className="text-foreground">{selectedPlatforms.join(', ')}</strong> — all scheduled and ready to go.
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
          className="w-full"
          size="lg"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span> Generating campaign…
            </span>
          ) : (
            '🚀 Generate Campaign'
          )}
        </Button>
      </div>
    </div>
  )
}
