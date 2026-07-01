'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { format, addHours, startOfHour, addDays, formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { MediaLibraryModal } from '../media/MediaLibraryModal'
import { PostPreviewCard } from './PostPreviewCard'
import PostPreview from './PostPreview'
import { UpgradeModal } from '../components/UpgradeModal'
import { HookLibrary } from '../components/HookLibrary'

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN'] as const
type Platform = (typeof PLATFORMS)[number]

// Platforms that support per-platform content variants
const VARIANT_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'LINKEDIN'] as const
type VariantPlatform = (typeof VARIANT_PLATFORMS)[number]

const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  X:         280,
  FACEBOOK:  63206,
  INSTAGRAM: 2200,
  TIKTOK:    2200,
  GOOGLE:    1500,
  LINKEDIN:  3000,
}

const PLATFORM_ICONS: Record<VariantPlatform, string> = {
  FACEBOOK:  '👤',
  INSTAGRAM: '📸',
  TIKTOK:    '🎵',
  X:         '🐦',
  LINKEDIN:  '💼',
}

interface PlatformVariant {
  platform: VariantPlatform
  content: string
  hashtags: string[]
  mediaUrls: string[]
}

// ── Per-platform variant tabs panel ────────────────────────────────────────
function PlatformVariantTabs({
  masterContent,
  activePlatforms,
  variants,
  onChange,
}: {
  masterContent: string
  activePlatforms: VariantPlatform[]
  variants: Record<VariantPlatform, PlatformVariant>
  onChange: (platform: VariantPlatform, updated: Partial<PlatformVariant>) => void
}) {
  const [activeTab, setActiveTab] = useState<VariantPlatform>(activePlatforms[0] ?? 'FACEBOOK')
  const [hashtagInput, setHashtagInput] = useState('')

  // Keep active tab valid when platforms change
  const tab = activePlatforms.includes(activeTab) ? activeTab : activePlatforms[0]

  if (activePlatforms.length === 0) return null

  const variant = variants[tab]
  const isX = tab === 'X'
  const isLinkedIn = tab === 'LINKEDIN'
  const charCount = variant.content.length
  const xWarn  = isX && charCount >= 240
  const xError = isX && charCount > 280
  const liWarn  = isLinkedIn && charCount >= 2800
  const liError = isLinkedIn && charCount > 3000

  function addHashtag() {
    const raw = hashtagInput.trim().replace(/^#/, '')
    if (!raw) return
    if (!variant.hashtags.includes(raw)) {
      onChange(tab, { hashtags: [...variant.hashtags, raw] })
    }
    setHashtagInput('')
  }

  function removeHashtag(tag: string) {
    onChange(tab, { hashtags: variant.hashtags.filter((h) => h !== tag) })
  }

  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b bg-background">
        {activePlatforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActiveTab(p)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              p === tab
                ? 'border-primary text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {PLATFORM_ICONS[p]} {p.charAt(0) + p.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          {tab === 'X' && 'Customise your X post. 280 character limit enforced.'}
          {tab === 'INSTAGRAM' && 'Add hashtags to boost Instagram reach.'}
          {tab === 'TIKTOK' && 'Note: video content must be uploaded separately via TikTok.'}
          {tab === 'FACEBOOK' && 'Customise your Facebook post content.'}
          {tab === 'LINKEDIN' && 'LinkedIn post — text, single image, or single video supported.'}
        </p>

        {/* Content textarea */}
        <Textarea
          value={variant.content}
          onChange={(e) => onChange(tab, { content: e.target.value })}
          rows={4}
          placeholder={`${tab.charAt(0) + tab.slice(1).toLowerCase()} post content…`}
          className={cn(
            'text-sm resize-none',
            (xError || liError) && 'border-destructive focus-visible:ring-destructive',
          )}
        />

        {/* X character counter */}
        {isX && (
          <div className="flex justify-end">
            <span className={cn(
              'text-xs tabular-nums',
              xError ? 'text-destructive font-semibold' : xWarn ? 'text-amber-500' : 'text-muted-foreground',
            )}>
              {charCount} / 280
              {xError && ' — exceeds limit'}
            </span>
          </div>
        )}

        {/* LinkedIn character counter */}
        {isLinkedIn && (
          <div className="flex justify-end">
            <span className={cn(
              'text-xs tabular-nums',
              liError ? 'text-destructive font-semibold' : liWarn ? 'text-amber-500' : 'text-muted-foreground',
            )}>
              {charCount} / 3000
              {liError && ' — may be truncated in some feeds'}
            </span>
          </div>
        )}

        {/* Instagram hashtag input */}
        {tab === 'INSTAGRAM' && (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <Input
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHashtag() } }}
                placeholder="Add hashtag (without #)"
                className="h-8 text-xs flex-1"
              />
              <button
                type="button"
                onClick={addHashtag}
                className="px-3 h-8 text-xs rounded-md border bg-background hover:bg-accent transition-colors"
              >
                Add
              </button>
            </div>
            {variant.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {variant.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      className="text-primary/60 hover:text-primary ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
// ───────────────────────────────────────────────────────────────────────────

const TONES = [
  { value: 'casual',       label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'informative',  label: 'Informative' },
  { value: 'witty',        label: 'Witty' },
] as const

interface Props {
  selectedDate: Date
  workspaceId: string
  token: string
  onSuccess: (requiresReview?: boolean) => void
  onClose: () => void
  initialContent?: string
  initialPlatforms?: string[]
  initialMediaUrls?: string[]
  initialDraftId?: string
}

function defaultTime(): string {
  const next = startOfHour(addHours(new Date(), 1))
  return format(next, 'HH:mm')
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
      <path d="M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17z"/>
      <path d="M19 2l.5 1.5L21 4l-1.5.5L19 6l-.5-1.5L17 4l1.5-.5L19 2z"/>
    </svg>
  )
}

function makeVariants(masterContent: string): Record<VariantPlatform, PlatformVariant> {
  return Object.fromEntries(
    VARIANT_PLATFORMS.map((p) => [p, { platform: p, content: masterContent, hashtags: [], mediaUrls: [] }])
  ) as unknown as Record<VariantPlatform, PlatformVariant>
}

export function CreatePostForm({ selectedDate, workspaceId, token, onSuccess, onClose, initialContent = '', initialPlatforms = [], initialMediaUrls = [], initialDraftId }: Props) {
  const [content, setContent] = useState(initialContent)
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrls.length > 0 ? initialMediaUrls : [''])
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(initialPlatforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p)))
  const [timeValue, setTimeValue] = useState(defaultTime)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [firstComment, setFirstComment] = useState('')

  // Campaign state
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [campaignInput, setCampaignInput] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [hookLibraryOpen, setHookLibraryOpen] = useState(false)

  // Draft autosave state
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Recurrence state
  const [recurrenceFreq, setRecurrenceFreq] = useState<string>('none')
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState<string>('')

  // Per-platform variant state
  const [variantsOpen, setVariantsOpen] = useState(false)
  const [variants, setVariants] = useState<Record<VariantPlatform, PlatformVariant>>(makeVariants(''))
  const activeVariantPlatforms = selectedPlatforms.filter((p): p is VariantPlatform =>
    (VARIANT_PLATFORMS as readonly string[]).includes(p)
  )

  function updateVariant(platform: VariantPlatform, patch: Partial<PlatformVariant>) {
    setVariants((prev) => ({ ...prev, [platform]: { ...prev[platform], ...patch } }))
  }

  // Best times state
  const [bestRecs, setBestRecs] = useState<Array<{ platform: string; topHours: number[]; heatmap: Array<{ hour: number; label: string }> }>>([])
  const [bestTimesOpen, setBestTimesOpen] = useState(false)
  const bestTimesRef = useRef<HTMLDivElement>(null)

  // Quick best-time button state
  const [bestTimeLoading, setBestTimeLoading] = useState(false)
  const [bestTimeApplied, setBestTimeApplied] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/analytics/best-times?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { recommendations?: typeof bestRecs }) => {
        setBestRecs(data.recommendations ?? [])
      })
      .catch(() => {/* silent */})
  }, [workspaceId, token])

  // Close best times dropdown on outside click
  useEffect(() => {
    if (!bestTimesOpen) return
    function handleClick(e: MouseEvent) {
      if (bestTimesRef.current && !bestTimesRef.current.contains(e.target as Node)) {
        setBestTimesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [bestTimesOpen])

  // Caption suggestion: auto-fetch when the first valid image URL is set
  useEffect(() => {
    const firstImageUrl = mediaUrls.find((u) =>
      /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(u.trim()),
    )
    if (!firstImageUrl || captionUrlRef.current === firstImageUrl) return
    captionUrlRef.current = firstImageUrl
    setCaptionDismissed(false)
    setCaptionSuggestion(null)
    setCaptionLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/ai/caption-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspaceId, imageUrl: firstImageUrl }),
    })
      .then((r) => r.json())
      .then((data: { caption?: string }) => {
        if (data.caption) setCaptionSuggestion(data.caption)
      })
      .catch(() => {})
      .finally(() => setCaptionLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrls])

  function applyBestHour(hour: number) {
    const hh = String(hour).padStart(2, '0')
    setTimeValue(`${hh}:00`)
    setBestTimesOpen(false)
  }

  async function handleBestTime() {
    setBestTimeLoading(true)
    setBestTimeApplied(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/analytics/best-times?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { recommendations?: Array<{ platform: string; topHours: number[]; heatmap: Array<{ hour: number; label: string }> }> }
      const recs = data.recommendations ?? []
      const match = recs.find(r => selectedPlatforms.includes(r.platform as Platform)) ?? recs[0]
      if (match && match.topHours.length > 0) {
        const hour = match.topHours[0]
        const hh = String(hour).padStart(2, '0')
        setTimeValue(`${hh}:00`)
        const label = match.heatmap[hour]?.label ?? `${hh}:00`
        setBestTimeApplied(`Set to ${label}`)
        setTimeout(() => setBestTimeApplied(null), 2500)
      }
    } catch { /* silent */ }
    finally { setBestTimeLoading(false) }
  }

  // Which recs to show — prefer platforms the user selected, fall back to all
  const visibleRecs = selectedPlatforms.length > 0
    ? bestRecs.filter((r) => selectedPlatforms.includes(r.platform as Platform))
    : bestRecs

  // Template picker state
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; content: string; platforms: string[]; category: string | null }>>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')

  // Load campaigns once on mount
  useEffect(() => {
    if (!workspaceId) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/campaigns?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { campaigns?: Array<{ id: string; name: string; color: string }> }) => {
        if (d.campaigns) setCampaigns(d.campaigns)
      })
      .catch(() => {})
  }, [workspaceId, token])

  async function handleCreateCampaign() {
    if (!campaignInput.trim() || !workspaceId) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, name: campaignInput.trim() }),
      })
      const data = await res.json() as { campaign?: { id: string; name: string; color: string } }
      if (data.campaign) {
        setCampaigns(prev => [...prev, data.campaign!])
        setCampaignId(data.campaign.id)
        setCampaignInput('')
        setCreatingCampaign(false)
      }
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    if (!templatesOpen || templatesLoaded) return
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    fetch(`${apiUrl}/api/v1/templates?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { templates?: typeof templates }) => {
        setTemplates(data.templates ?? [])
        setTemplatesLoaded(true)
      })
      .catch(() => setTemplatesLoaded(true))
  }, [templatesOpen, templatesLoaded, workspaceId, token])

  function useTemplate(tpl: { content: string; platforms: string[] }) {
    handleContentChange(tpl.content)
    if (tpl.platforms.length > 0) {
      setSelectedPlatforms(tpl.platforms as Platform[])
    }
    setTemplatesOpen(false)
    setTemplateSearch('')
  }

  // Link preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ title: string | null; description: string | null; image: string | null; siteName: string | null; url: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const extractFirstUrl = (text: string): string | null => {
    const m = /https?:\/\/[^\s<>"]+/i.exec(text)
    return m ? m[0] : null
  }

  const fetchLinkPreview = useCallback(async (url: string) => {
    setPreviewLoading(true)
    setPreview(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/link-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) { setPreviewLoading(false); return }
      const data = (await res.json()) as { title: string | null; description: string | null; image: string | null; siteName: string | null; url: string }
      setPreview(data)
    } catch {
      // silent — preview is non-critical
    } finally {
      setPreviewLoading(false)
    }
  }, [token])

  const handleContentChange = (value: string) => {
    setContent(value)
    // Keep variants seeded with master content when master changes (only if not yet customised)
    setVariants((prev) => {
      const updated = { ...prev }
      for (const p of VARIANT_PLATFORMS) {
        if (prev[p].content === content) {
          updated[p] = { ...prev[p], content: value }
        }
      }
      return updated
    })
    // Auto-close score panel if content has changed significantly from what was scored
    if (scoreOpen && scoreContentRef.current) {
      const diff = Math.abs(value.length - scoreContentRef.current.length)
      if (diff > 20) setScoreOpen(false)
    }
    // Autosave draft
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(() => { void saveDraft() }, 3000)

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const url = extractFirstUrl(value)
      if (url && url !== previewUrl) {
        setPreviewUrl(url)
        setPreviewDismissed(false)
        fetchLinkPreview(url)
      } else if (!url) {
        setPreviewUrl(null)
        setPreview(null)
        setPreviewDismissed(false)
      }
    }, 800)
  }

  // Hashtag suggestion state
  const [hashtagLoading, setHashtagLoading] = useState(false)
  const [hashtagsByPlatform, setHashtagsByPlatform] = useState<Record<string, string[]>>({})
  const [hashtagError, setHashtagError] = useState<string | null>(null)

  async function fetchHashtags() {
    if (!content.trim() || selectedPlatforms.length === 0) return
    setHashtagLoading(true)
    setHashtagError(null)
    setHashtagsByPlatform({})
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/hashtags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, content: content.trim(), platforms: selectedPlatforms }),
      })
      const data = (await res.json()) as { hashtags?: Record<string, string[]>; error?: string }
      if (!res.ok) { setHashtagError(data.error ?? 'Failed to generate hashtags'); return }
      setHashtagsByPlatform(data.hashtags ?? {})
    } catch {
      setHashtagError('Network error — please try again')
    } finally {
      setHashtagLoading(false)
    }
  }

  function appendHashtags(tags: string[]) {
    const tail = tags.join(' ')
    setContent((c) => (c.trimEnd() ? `${c.trimEnd()}\n\n${tail}` : tail))
    setHashtagsByPlatform({})
  }

  // UTM builder state
  const [utmOpen, setUtmOpen] = useState(false)
  const [utmUrl, setUtmUrl] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('social')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmCopied, setUtmCopied] = useState(false)

  // Auto-update UTM source when platform changes
  useEffect(() => {
    if (selectedPlatforms.length > 0) {
      setUtmSource(selectedPlatforms[0].toLowerCase())
    }
  }, [selectedPlatforms])

  // Autosave draft when platforms change
  useEffect(() => {
    if (!content.trim() && !draftId) return
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(() => { void saveDraft() }, 3000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatforms])

  const utmBuiltUrl = utmUrl.trim()
    ? `${utmUrl.trim()}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign)}`
    : ''

  function copyUtm() {
    if (!utmBuiltUrl) return
    navigator.clipboard.writeText(utmBuiltUrl).catch(() => { /* ignore */ })
    setUtmCopied(true)
    setTimeout(() => setUtmCopied(false), 2000)
  }

  function addUtmToPost() {
    if (!utmBuiltUrl) return
    setContent((c) => c.trimEnd() ? `${c.trimEnd()} ${utmBuiltUrl}` : utmBuiltUrl)
  }

  // AI Image generation state
  const [aiImageOpen, setAiImageOpen] = useState(false)
  const [aiImagePrompt, setAiImagePrompt] = useState('')
  const [aiImageSize, setAiImageSize] = useState<'square' | 'landscape' | 'portrait'>('square')
  const [aiImageLoading, setAiImageLoading] = useState(false)
  const [aiImageError, setAiImageError] = useState<string | null>(null)
  const [aiImagePreview, setAiImagePreview] = useState<string | null>(null)

  const AI_IMAGE_SIZES = {
    square:    { label: 'Square (1024×1024)',   width: 1024, height: 1024 },
    landscape: { label: 'Landscape (1280×720)', width: 1280, height: 720 },
    portrait:  { label: 'Portrait (720×1280)',  width: 720,  height: 1280 },
  }

  async function handleGenerateImage() {
    if (!aiImagePrompt.trim()) { setAiImageError('Image prompt is required'); return }
    setAiImageLoading(true)
    setAiImageError(null)
    setAiImagePreview(null)
    const { width, height } = AI_IMAGE_SIZES[aiImageSize]
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: aiImagePrompt.trim(), width, height }),
      })
      const data = (await res.json()) as { imageUrl?: string; error?: string }
      if (!res.ok) { setAiImageError(data.error ?? 'Failed to generate image'); return }
      setAiImagePreview(data.imageUrl ?? null)
    } catch {
      setAiImageError('Network error — please try again')
    } finally {
      setAiImageLoading(false)
    }
  }

  function useAiImage() {
    if (!aiImagePreview) return
    const emptyIdx = mediaUrls.findIndex((u) => !u.trim())
    if (emptyIdx !== -1) {
      const next = [...mediaUrls]
      next[emptyIdx] = aiImagePreview
      setMediaUrls(next)
    } else {
      setMediaUrls((prev) => [...prev, aiImagePreview!])
    }
    setAiImagePreview(null)
    setAiImageOpen(false)
  }

  // Translate state
  const [translateOpen, setTranslateOpen] = useState(false)
  const [translateLang, setTranslateLang] = useState('Spanish')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [translated, setTranslated] = useState<string | null>(null)

  const TRANSLATE_LANGUAGES = [
    'Spanish', 'French', 'German', 'Portuguese', 'Arabic',
    'Japanese', 'Chinese', 'Hindi', 'Italian', 'Korean',
  ]

  async function handleTranslate() {
    if (!content.trim()) { setTranslateError('Write some content first'); return }
    setTranslating(true)
    setTranslateError(null)
    setTranslated(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: content.trim(), targetLanguage: translateLang }),
      })
      const data = (await res.json()) as { translated?: string; error?: string }
      if (!res.ok) { setTranslateError(data.error ?? 'Translation failed'); return }
      setTranslated(data.translated ?? null)
    } catch {
      setTranslateError('Network error — please try again')
    } finally {
      setTranslating(false)
    }
  }

  function useTranslation() {
    if (!translated) return
    handleContentChange(translated)
    setTranslated(null)
    setTranslateOpen(false)
  }

  // Post scorer state
  const [scoreOpen, setScoreOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreResult, setScoreResult] = useState<{
    overall: number
    scores: { hook: number; readability: number; cta: number; hashtags: number; length: number; engagement_bait: number }
    tips: string[]
    verdict: string
  } | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const scoreContentRef = useRef<string>('')

  // AI Writing Coach
  const [coachOpen, setCoachOpen] = useState(false)
  const [coachInstruction, setCoachInstruction] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [coachHistory, setCoachHistory] = useState<Array<{ instruction: string; before: string; after: string }>>([])

  // ── Upgrade modal state ────────────────────────────────────────────────────
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeFeature, setUpgradeFeature] = useState('')
  const [upgradeMessage, setUpgradeMessage] = useState<string | undefined>(undefined)

  function handlePlanLimit(featureName: string, message?: string) {
    setUpgradeFeature(featureName)
    setUpgradeMessage(message)
    setUpgradeOpen(true)
  }

  async function handleScorePost() {
    if (!content.trim()) { setScoreError('Write some content first'); return }
    setScoring(true)
    setScoreError(null)
    setScoreResult(null)
    scoreContentRef.current = content
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/score-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: content.trim(), platforms: selectedPlatforms }),
      })
      const data = (await res.json()) as typeof scoreResult & { error?: string }
      if (!res.ok) {
        if ((data as any).error === 'PLAN_LIMIT') {
          handlePlanLimit('AI Post Scoring', (data as any).message)
          return
        }
        setScoreError((data as { error?: string }).error ?? 'Scoring failed'); return
      }
      setScoreResult(data)
      setScoreOpen(true)
    } catch {
      setScoreError('Network error — please try again')
    } finally {
      setScoring(false)
    }
  }

  async function handleCoach() {
    if (!coachInstruction.trim() || !content.trim()) return
    setCoachLoading(true)
    setCoachError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          instruction: coachInstruction,
          platform: selectedPlatforms[0] ?? undefined,
        }),
      })
      const data = await res.json() as { improved?: string; error?: string }
      if (!res.ok) { setCoachError(data.error ?? 'Failed'); return }
      const before = content
      setContent(data.improved ?? content)
      setCoachHistory((prev) => [{ instruction: coachInstruction, before, after: data.improved ?? content }, ...prev.slice(0, 4)])
      setCoachInstruction('')
    } catch {
      setCoachError('Network error — please try again')
    } finally {
      setCoachLoading(false)
    }
  }

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState<string>('casual')
  const [aiVariations, setAiVariations] = useState<string>('1')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [generatedVariations, setGeneratedVariations] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform],
    )
  }

  const addMediaUrl = () => setMediaUrls((prev) => [...prev, ''])
  const removeMediaUrl = (index: number) => setMediaUrls((prev) => prev.filter((_, i) => i !== index))
  const updateMediaUrl = (index: number, value: string) =>
    setMediaUrls((prev) => prev.map((u, i) => (i === index ? value : u)))

  const charLimit = selectedPlatforms.length > 0
    ? Math.min(...selectedPlatforms.map((p) => PLATFORM_CHAR_LIMITS[p]))
    : 2200
  const charsLeft = charLimit - content.length
  const charWarning = charsLeft < 20

  async function handleGenerate() {
    if (!aiPrompt.trim()) { setAiError('Describe what you want to post about'); return }
    if (selectedPlatforms.length === 0) { setAiError('Select at least one platform above first'); return }

    setAiError(null)
    setAiGenerating(true)
    setGeneratedVariations([])

    const numVariations = parseInt(aiVariations, 10)
    const vars: string[] = Array(numVariations).fill('')

    abortRef.current = new AbortController()

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: aiPrompt,
          platforms: selectedPlatforms,
          tone: aiTone,
          variations: numVariations,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setAiError(body.error ?? 'Generation failed')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setAiError('Stream unavailable'); return }

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let currentVariation = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data) as { text?: string; error?: string }
            if (parsed.error) { setAiError(parsed.error); return }
            if (parsed.text) {
              accumulated += parsed.text

              // Split on "---" separator between variations
              const parts = accumulated.split(/\n---\n/)
              for (let i = 0; i < parts.length; i++) {
                vars[i] = parts[i].trim()
              }
              currentVariation = Math.min(parts.length - 1, numVariations - 1)
              setGeneratedVariations([...vars])
            }
          } catch { /* malformed chunk — skip */ }
        }
      }

      // Clean up: remove leading/trailing "---" artifacts
      const cleaned = vars
        .map((v) => v.replace(/^---\s*/g, '').replace(/\s*---$/g, '').trim())
        .filter(Boolean)
      setGeneratedVariations(cleaned)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAiError('Network error — please try again')
      }
    } finally {
      setAiGenerating(false)
    }
  }

  function useVariation(text: string) {
    handleContentChange(text)
    setGeneratedVariations([])
    setAiOpen(false)
    setAiPrompt('')
  }

  // Draft save function
  const saveDraft = useCallback(async () => {
    if (!draftId && !content.trim()) return
    setDraftSaving(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    const [hours, minutes] = timeValue.split(':').map(Number)
    const scheduledDate = new Date(selectedDate)
    scheduledDate.setHours(hours, minutes, 0, 0)
    const payload = {
      workspaceId,
      content,
      platforms: selectedPlatforms,
      mediaUrls: mediaUrls.filter((u) => u.trim()),
      scheduledFor: scheduledDate.toISOString(),
    }
    try {
      if (!draftId) {
        const res = await fetch(`${apiUrl}/api/v1/posts/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = (await res.json()) as { post: { id: string } }
          setDraftId(data.post.id)
          setDraftSavedAt(new Date())
        }
      } else {
        const res = await fetch(`${apiUrl}/api/v1/posts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          setDraftSavedAt(new Date())
        }
      }
    } catch { /* silent — draft save is non-critical */ }
    finally { setDraftSaving(false) }
  }, [draftId, content, timeValue, selectedDate, workspaceId, selectedPlatforms, mediaUrls, token])

  const [queueLoading, setQueueLoading] = useState(false)

  // ── Content Multiplier ─────────────────────────────────────────────────────
  const [multiplyLoading, setMultiplyLoading] = useState(false)
  const [multiplyError, setMultiplyError] = useState<string | null>(null)

  // ── SafeGuard ──────────────────────────────────────────────────────────────
  const [safeGuardReport, setSafeGuardReport] = useState<Record<string, { status: string; flags: string[] }> | null>(null)
  const [safeGuardLoading, setSafeGuardLoading] = useState(false)
  const [safeGuardExpanded, setSafeGuardExpanded] = useState(false)
  const [safeGuardDismissed, setSafeGuardDismissed] = useState(false)
  const [riskConfirmPending, setRiskConfirmPending] = useState<'schedule' | 'queue' | null>(null)

  // ── Caption Suggestion ─────────────────────────────────────────────────────
  const [captionSuggestion, setCaptionSuggestion] = useState<string | null>(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [captionDismissed, setCaptionDismissed] = useState(false)
  const captionUrlRef = useRef<string>('')

  // ── Content Multiplier handler ─────────────────────────────────────────────
  async function handleMultiply() {
    if (!content.trim()) { setMultiplyError('Write some master content first'); return }
    setMultiplyLoading(true)
    setMultiplyError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/multiply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, content: content.trim() }),
      })
      const data = (await res.json()) as {
        variants?: Record<string, { content: string; hashtags: string[]; mediaUrls: string[] }>
        error?: string
      }
      if (!res.ok) {
        if ((data as any).error === 'PLAN_LIMIT') {
          handlePlanLimit('AI Content Multiplier', (data as any).message)
          return
        }
        setMultiplyError(data.error ?? 'Failed to generate variants'); return
      }
      if (data.variants) {
        setVariants((prev) => {
          const next = { ...prev }
          for (const p of VARIANT_PLATFORMS) {
            const v = data.variants![p]
            if (v) next[p] = { platform: p, content: v.content, hashtags: v.hashtags, mediaUrls: [] }
          }
          return next
        })
        setVariantsOpen(true)
      }
    } catch {
      setMultiplyError('Network error — please try again')
    } finally {
      setMultiplyLoading(false)
    }
  }

  // ── SafeGuard handlers ─────────────────────────────────────────────────────
  async function handleSafetyScan() {
    if (!content.trim() || selectedPlatforms.length === 0) return
    setSafeGuardLoading(true)
    setSafeGuardDismissed(false)
    setSafeGuardReport(null)
    const variantsToScan: Record<string, string> = {}
    for (const p of selectedPlatforms) {
      const vp = p as VariantPlatform
      const hasVariant = (VARIANT_PLATFORMS as readonly string[]).includes(p) && variants[vp]?.content?.trim()
      variantsToScan[p] = hasVariant ? variants[vp].content.trim() : content.trim()
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/ai/safety-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, variants: variantsToScan }),
      })
      const data = (await res.json()) as {
        report?: Record<string, { status: string; flags: string[] }>
        error?: string
      }
      if (res.ok && data.report) setSafeGuardReport(data.report)
    } catch { /* silent — safety scan is advisory */ }
    finally { setSafeGuardLoading(false) }
  }

  async function logRiskOverride() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      await fetch(`${apiUrl}/api/v1/ai/safety-scan/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspaceId, report: safeGuardReport }),
      })
    } catch { /* silent */ }
  }

  function overallSafeGuardStatus(): 'clear' | 'warning' | 'risk' | null {
    if (!safeGuardReport) return null
    const statuses = Object.values(safeGuardReport).map((r) => r.status)
    if (statuses.includes('risk')) return 'risk'
    if (statuses.includes('warning')) return 'warning'
    return 'clear'
  }

  const handleQueueSchedule = async () => {
    if (overallSafeGuardStatus() === 'risk' && riskConfirmPending !== 'queue') {
      setRiskConfirmPending('queue')
      return
    }
    if (riskConfirmPending === 'queue') {
      await logRiskOverride()
      setRiskConfirmPending(null)
    }
    setError(null)
    if (!content.trim()) { setError('Content is required'); return }
    if (selectedPlatforms.length === 0) { setError('Select at least one platform'); return }
    setQueueLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/posts/queue-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId,
          content: content.trim(),
          mediaUrls: mediaUrls.filter((u) => u.trim().length > 0),
          platforms: selectedPlatforms,
          ...(firstComment.trim() && { firstComment: firstComment.trim() }),
          platformVariants: activeVariantPlatforms.map((p) => ({
            platform: p,
            content: variants[p].content.trim() || content.trim(),
            hashtags: variants[p].hashtags,
            mediaUrls: variants[p].mediaUrls,
          })),
          ...(recurrenceFreq !== 'none' ? { recurrenceFreq } : {}),
          ...(recurrenceFreq !== 'none' && recurrenceEndsAt ? { recurrenceEndsAt: new Date(recurrenceEndsAt).toISOString() } : {}),
        }),
      })
      const body = await res.json() as { message?: string; scheduledFor?: string; requiresReview?: boolean }
      if (!res.ok) {
        setError(body.message ?? 'Failed to add to queue')
        return
      }
      onSuccess(body.requiresReview ?? false)
    } catch {
      setError('Network error — please try again')
    } finally {
      setQueueLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (overallSafeGuardStatus() === 'risk' && riskConfirmPending !== 'schedule') {
      setRiskConfirmPending('schedule')
      return
    }
    if (riskConfirmPending === 'schedule') {
      await logRiskOverride()
      setRiskConfirmPending(null)
    }
    setError(null)
    if (!content.trim()) { setError('Content is required'); return }
    if (selectedPlatforms.length === 0) { setError('Select at least one platform'); return }
    if (content.length > charLimit) {
      setError(`Content exceeds the ${charLimit}-character limit for the selected platforms`)
      return
    }

    const [hours, minutes] = timeValue.split(':').map(Number)
    const scheduledDate = new Date(selectedDate)
    scheduledDate.setHours(hours, minutes, 0, 0)

    if (scheduledDate.getTime() <= Date.now()) {
      setError('Scheduled time must be in the future')
      return
    }

    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const res = await fetch(`${apiUrl}/api/v1/posts/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId,
          content: content.trim(),
          mediaUrls: mediaUrls.filter((u) => u.trim().length > 0),
          platforms: selectedPlatforms,
          scheduledFor: scheduledDate.toISOString(),
          ...(utmSource.trim() && { utmSource: utmSource.trim() }),
          ...(utmMedium.trim() && { utmMedium: utmMedium.trim() }),
          ...(utmCampaign.trim() && { utmCampaign: utmCampaign.trim() }),
          ...(firstComment.trim() && { firstComment: firstComment.trim() }),
          ...(campaignId && { campaignId }),
          platformVariants: activeVariantPlatforms.map((p) => ({
            platform: p,
            content: variants[p].content.trim() || content.trim(),
            hashtags: variants[p].hashtags,
            mediaUrls: variants[p].mediaUrls,
          })),
          ...(recurrenceFreq !== 'none' ? { recurrenceFreq } : {}),
          ...(recurrenceFreq !== 'none' && recurrenceEndsAt ? { recurrenceEndsAt: new Date(recurrenceEndsAt).toISOString() } : {}),
        }),
      })
      const body = (await res.json()) as { error?: string; requiresReview?: boolean }
      if (!res.ok) {
        setError(body.error ?? 'Failed to schedule post')
        return
      }
      onSuccess(body.requiresReview ?? false)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const scheduledDateTime = (() => {
    const [hours, minutes] = timeValue.split(':').map(Number)
    const d = new Date(selectedDate)
    d.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    return d.toISOString()
  })()

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
    <div className="space-y-4">

      {/* Platforms */}
      <div className="space-y-2">
        <Label>Platforms</Label>
        <div className="flex flex-wrap gap-4">
          {PLATFORMS.map((platform) => (
            <div key={platform} className="flex items-center gap-2">
              <Checkbox
                id={`platform-${platform}`}
                checked={selectedPlatforms.includes(platform)}
                onCheckedChange={() => togglePlatform(platform)}
              />
              <label htmlFor={`platform-${platform}`} className="text-sm cursor-pointer select-none">
                {platform}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Template Picker */}
      <div className="rounded-lg border border-dashed overflow-hidden">
        <button
          type="button"
          onClick={() => setTemplatesOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Use a Template
          <span className="ml-auto text-xs">{templatesOpen ? '▲' : '▼'}</span>
        </button>

        {templatesOpen && (
          <div className="border-t p-3 space-y-2 bg-muted/20">
            <Input
              placeholder="Search templates…"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="h-7 text-xs"
            />
            {!templatesLoaded ? (
              <p className="text-xs text-muted-foreground py-2 text-center">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No templates yet — <a href="/dashboard/templates" className="underline">create one</a>
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {templates
                  .filter((t) => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.content.toLowerCase().includes(templateSearch.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => useTemplate(t)}
                      className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-muted transition-colors space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{t.name}</span>
                        {t.category && <span className="text-muted-foreground">{t.category}</span>}
                      </div>
                      <p className="text-muted-foreground line-clamp-1">{t.content}</p>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Generation Panel */}
      <div className="rounded-lg border border-dashed overflow-hidden">
        <button
          type="button"
          onClick={() => setAiOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <SparkleIcon />
          ✨ Generate with AI
          <span className="ml-auto text-xs">{aiOpen ? '▲' : '▼'}</span>
        </button>

        {aiOpen && (
          <div className="border-t p-3 space-y-3 bg-muted/20">
            <div className="space-y-1.5">
              <Label className="text-xs">What do you want to post about?</Label>
              <Textarea
                placeholder="e.g. Announce our summer sale — 20% off everything, ends July 4th. Highlight the limited time urgency."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Tone</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setAiTone(t.value)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors',
                        aiTone === t.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:border-muted-foreground',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Variations</Label>
                <div className="flex gap-1.5">
                  {(['1', '2', '3'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAiVariations(v)}
                      className={cn(
                        'text-xs px-3 py-1 rounded-full border transition-colors',
                        aiVariations === v
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:border-muted-foreground',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleGenerate}
                disabled={aiGenerating}
              >
                {aiGenerating ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  <><SparkleIcon /> Generate</>
                )}
              </Button>
            </div>

            {aiError && (
              <p className="text-xs text-destructive">{aiError}</p>
            )}

            {/* Streaming preview while generating */}
            {aiGenerating && generatedVariations.length === 0 && (
              <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground animate-pulse min-h-[60px]">
                ⚡ Streaming…
              </div>
            )}

            {/* Generated variations */}
            {generatedVariations.filter(Boolean).map((text, i) => (
              <div key={i} className="rounded-md border bg-background overflow-hidden">
                <div className="px-3 pt-3 pb-2 text-sm whitespace-pre-wrap leading-relaxed min-h-[60px]">
                  {text}
                  {aiGenerating && i === generatedVariations.filter(Boolean).length - 1 && (
                    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                  <span className={cn(
                    'text-xs tabular-nums',
                    text.length > charLimit ? 'text-destructive font-medium' : 'text-muted-foreground',
                  )}>
                    {text.length} / {charLimit.toLocaleString()} chars
                    {parseInt(aiVariations, 10) > 1 && ` · Variation ${i + 1}`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => useVariation(text)}
                    disabled={aiGenerating}
                  >
                    Use this
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Image Generation Panel */}
      <div className="rounded-lg border border-dashed overflow-hidden">
        <button
          type="button"
          onClick={() => setAiImageOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          AI Image
          <span className="ml-auto text-xs">{aiImageOpen ? '▲' : '▼'}</span>
        </button>

        {aiImageOpen && (
          <div className="border-t p-3 space-y-3 bg-muted/20">
            <div className="space-y-1.5">
              <Label className="text-xs">Image prompt</Label>
              <Textarea
                placeholder="e.g. A vibrant summer sale banner with bright colors and confetti..."
                value={aiImagePrompt}
                onChange={(e) => setAiImagePrompt(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Size</Label>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.entries(AI_IMAGE_SIZES) as [typeof aiImageSize, { label: string; width: number; height: number }][]).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAiImageSize(key)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      aiImageSize === key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleGenerateImage}
              disabled={aiImageLoading}
            >
              {aiImageLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Generating…
                </>
              ) : 'Generate Image'}
            </Button>

            {aiImageError && (
              <p className="text-xs text-destructive">{aiImageError}</p>
            )}

            {aiImagePreview && (
              <div className="rounded-md border overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={aiImagePreview}
                  alt="AI generated preview"
                  className="w-full max-h-64 object-contain bg-muted"
                  onError={() => setAiImageError('Failed to load image — try a different prompt')}
                />
                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                  <span className="text-xs text-muted-foreground">AI Generated</span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={useAiImage}>
                    Use This Image
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content with live character counter */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>Content</Label>
            <button type="button" onClick={() => setHookLibraryOpen((o) => !o)}
              className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium">
              🎣 Hook Library
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScorePost}
              disabled={scoring || !content.trim()}
              className={cn(
                'text-xs px-2 py-0.5 rounded-md border transition-colors font-medium',
                scoring || !content.trim()
                  ? 'opacity-50 cursor-not-allowed border-border text-muted-foreground'
                  : 'border-primary/40 text-primary hover:bg-primary/5',
              )}
            >
              {scoring ? '⏳ Scoring…' : '🎯 Score'}
            </button>
            <button
              type="button"
              onClick={() => setCoachOpen((o) => !o)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                coachOpen
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700'
                  : 'bg-background hover:bg-accent border-border text-muted-foreground hover:text-foreground',
              )}
            >
              🧑‍🏫 Coach
            </button>
            <button
              type="button"
              onClick={() => { setTranslateOpen((o) => !o); setTranslated(null); setTranslateError(null) }}
              className={cn(
                'text-xs px-2 py-0.5 rounded-md border transition-colors font-medium',
                translateOpen
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              Translate
            </button>
            <span className={cn(
              'text-xs tabular-nums',
              charWarning ? 'text-destructive font-medium' : 'text-muted-foreground',
            )}>
              {content.length} / {charLimit.toLocaleString()}
            </span>
          </div>
        </div>
        {hookLibraryOpen && (
          <HookLibrary
            onInsert={(text) => setContent((prev) => text + (prev ? '\n\n' + prev : ''))}
            onClose={() => setHookLibraryOpen(false)}
          />
        )}
        <Textarea
          placeholder="Write your post, or generate one with AI above."
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          rows={4}
          className={cn(charWarning && content.length > charLimit && 'border-destructive')}
        />

        {/* Per-platform content customiser */}
        {activeVariantPlatforms.length > 0 && (
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setVariantsOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
                </svg>
                {variantsOpen ? 'Hide' : 'Customise'} per-platform content
                <span className="text-muted-foreground font-normal">
                  ({activeVariantPlatforms.length} platform{activeVariantPlatforms.length !== 1 ? 's' : ''})
                </span>
              </button>

              {/* Content Multiplier */}
              <button
                type="button"
                onClick={handleMultiply}
                disabled={multiplyLoading || !content.trim()}
                className={cn(
                  'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors',
                  multiplyLoading || !content.trim()
                    ? 'text-muted-foreground border-border cursor-not-allowed opacity-50'
                    : 'text-violet-600 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-950/30',
                )}
                title="Use AI to generate tailored variants for each platform"
              >
                {multiplyLoading ? (
                  <><span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> Multiplying…</>
                ) : (
                  <><SparkleIcon /> Multiply for all platforms</>
                )}
              </button>
            </div>

            {multiplyError && (
              <p className="text-xs text-destructive mt-1">{multiplyError}</p>
            )}

            {variantsOpen && (
              <div className="mt-2">
                <PlatformVariantTabs
                  masterContent={content}
                  activePlatforms={activeVariantPlatforms}
                  variants={variants}
                  onChange={updateVariant}
                />
              </div>
            )}
          </div>
        )}

        {/* Score panel */}
        {scoreError && !scoring && (
          <p className="text-xs text-destructive mt-1">{scoreError}</p>
        )}
        {scoreResult && scoreOpen && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Post Score</span>
              <button
                type="button"
                onClick={() => setScoreOpen(false)}
                className="text-muted-foreground hover:text-foreground text-base leading-none"
              >
                ×
              </button>
            </div>

            {/* Overall score circle */}
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-16 h-16 rounded-full flex flex-col items-center justify-center border-4 flex-shrink-0',
                scoreResult.overall > 7
                  ? 'border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                  : scoreResult.overall >= 5
                  ? 'border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30'
                  : 'border-red-400 text-red-600 bg-red-50 dark:bg-red-950/30',
              )}>
                <span className="text-xl font-bold leading-none">{scoreResult.overall}</span>
                <span className="text-[10px] text-muted-foreground leading-none">/10</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{scoreResult.verdict}</p>
            </div>

            {/* Score bars */}
            <div className="space-y-2">
              {(Object.entries(scoreResult.scores) as [string, number][]).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-24 capitalize">{key.replace('_', ' ')}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        val > 7 ? 'bg-emerald-400' : val >= 5 ? 'bg-yellow-400' : 'bg-red-400',
                      )}
                      style={{ width: `${val * 10}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium tabular-nums w-6 text-right">{val}</span>
                </div>
              ))}
            </div>

            {/* Tips */}
            {scoreResult.tips.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tips</p>
                <ul className="space-y-1">
                  {scoreResult.tips.slice(0, 3).map((tip, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">→</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Coach panel */}
        {coachOpen && (
          <div className="rounded-xl border bg-gradient-to-br from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/20 dark:to-violet-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">🧑‍🏫 AI Writing Coach</p>
                <p className="text-xs text-muted-foreground">Tell me how to improve your post</p>
              </div>
              <button type="button" onClick={() => setCoachOpen(false)} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Add a strong hook', 'Make it shorter', 'Add urgency', 'Make it funnier', 'More professional', 'Add a CTA'].map((s) => (
                <button key={s} type="button" onClick={() => setCoachInstruction(s)}
                  className="px-2.5 py-1 text-xs rounded-full bg-background border hover:bg-accent transition-colors">
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 h-9 text-sm border rounded-lg px-3 bg-background outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. make it more engaging for LinkedIn…"
                value={coachInstruction}
                onChange={(e) => setCoachInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCoach() }}
                disabled={coachLoading}
              />
              <button type="button" onClick={handleCoach}
                disabled={coachLoading || !coachInstruction.trim() || !content.trim()}
                className="px-4 h-9 text-sm rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                {coachLoading ? '⏳' : '✨ Apply'}
              </button>
            </div>
            {coachError && <p className="text-xs text-destructive">{coachError}</p>}
            {coachHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Changes</p>
                {coachHistory.map((h, i) => (
                  <div key={i} className="rounded-lg bg-background border p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">&ldquo;{h.instruction}&rdquo;</span>
                      <button type="button" onClick={() => setContent(h.before)}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline">
                        Undo
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{h.after}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Translate panel */}
        {translateOpen && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={translateLang}
                onChange={(e) => setTranslateLang(e.target.value)}
                className="text-xs h-8 rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleTranslate}
                disabled={translating || !content.trim()}
              >
                {translating ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                    Translating…
                  </>
                ) : 'Translate'}
              </Button>
              <button
                type="button"
                onClick={() => { setTranslateOpen(false); setTranslated(null); setTranslateError(null) }}
                className="text-xs text-muted-foreground hover:text-foreground ml-auto"
              >
                Close
              </button>
            </div>

            {translateError && (
              <p className="text-xs text-destructive">{translateError}</p>
            )}

            {translated && (
              <div className="rounded-md border bg-background overflow-hidden">
                <p className="px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed">{translated}</p>
                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                  <span className="text-xs text-muted-foreground">{translateLang} translation</span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={useTranslation}>
                    Use Translation
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link preview card */}
      {previewUrl && !previewDismissed && (previewLoading || preview) && (
        <div className="rounded-lg border bg-muted/40 overflow-hidden">
          {previewLoading ? (
            <div className="flex gap-3 p-3 animate-pulse">
              <div className="w-20 h-16 rounded bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ) : preview ? (
            <div className="flex gap-3 p-3 items-start">
              {preview.image && (
                <img
                  src={preview.image}
                  alt=""
                  className="w-20 h-16 object-cover rounded flex-shrink-0 bg-muted"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0 space-y-0.5">
                {preview.siteName && (
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium truncate">
                    {preview.siteName}
                  </p>
                )}
                {preview.title && (
                  <p className="text-sm font-bold leading-snug line-clamp-2">{preview.title}</p>
                )}
                {preview.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{preview.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewDismissed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5 text-base leading-none"
                aria-label="Dismiss preview"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Caption suggestion banner */}
      {(captionLoading || (captionSuggestion && !captionDismissed)) && (
        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-3 py-2.5 flex items-start gap-2">
          <span className="mt-0.5 text-violet-500"><SparkleIcon /></span>
          <div className="flex-1 min-w-0">
            {captionLoading ? (
              <p className="text-xs text-violet-600 dark:text-violet-400">Generating caption from image…</p>
            ) : captionSuggestion ? (
              <>
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">
                  ✨ AI caption suggestion
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{captionSuggestion}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (content.trim() && !window.confirm('Replace current content with the AI caption?')) return
                    handleContentChange(captionSuggestion)
                    setCaptionDismissed(true)
                  }}
                  className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                >
                  Insert caption
                </button>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => { setCaptionDismissed(true); setCaptionSuggestion(null) }}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 text-base leading-none mt-0.5"
            aria-label="Dismiss caption suggestion"
          >
            ×
          </button>
        </div>
      )}

      {/* Hashtag suggestions */}
      <div>
        <button
          type="button"
          onClick={fetchHashtags}
          disabled={hashtagLoading || !content.trim() || selectedPlatforms.length === 0}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors',
            hashtagLoading || !content.trim() || selectedPlatforms.length === 0
              ? 'text-muted-foreground border-border cursor-not-allowed opacity-50'
              : 'text-primary border-primary/30 hover:bg-primary/5',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
            <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
          </svg>
          {hashtagLoading ? 'Suggesting…' : 'Suggest hashtags'}
        </button>

        {hashtagError && (
          <p className="text-xs text-destructive mt-1.5">{hashtagError}</p>
        )}

        {Object.keys(hashtagsByPlatform).length > 0 && (
          <div className="mt-2 rounded-lg border bg-muted/40 p-3 space-y-3">
            {Object.entries(hashtagsByPlatform).map(([platform, tags]) => (
              <div key={platform}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{platform}</span>
                  <button
                    type="button"
                    onClick={() => appendHashtags(tags)}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Add all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setContent((c) => c.trimEnd() ? `${c.trimEnd()} ${tag}` : tag)}
                      className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20 font-medium"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHashtagsByPlatform({})}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Media URLs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Media <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <button
            type="button"
            onClick={() => setShowMediaLibrary(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            📁 Media Library
          </button>
        </div>
        {mediaUrls.map((url, i) => (
          <div key={i} className="flex gap-2 items-center">
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-8 w-8 rounded object-cover border shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            <Input
              placeholder="https://example.com/image.jpg"
              value={url}
              onChange={(e) => updateMediaUrl(i, e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => removeMediaUrl(i)} disabled={mediaUrls.length === 1}>
              ✕
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addMediaUrl}>+ Add URL</Button>
      </div>

      {/* Post preview */}
      <PostPreviewCard
        content={content}
        platforms={selectedPlatforms as ('FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X' | 'GOOGLE' | 'LINKEDIN')[]}
        mediaUrls={mediaUrls.filter((u) => u.trim().length > 0)}
      />

      {/* UTM Tracking */}
      <div className="rounded-lg border border-dashed overflow-hidden">
        <button
          type="button"
          onClick={() => setUtmOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
          UTM Tracking
          <span className="ml-auto text-xs">{utmOpen ? '▲' : '▼'}</span>
        </button>

        {utmOpen && (
          <div className="border-t p-3 space-y-3 bg-muted/20">
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign URL</Label>
              <Input
                placeholder="https://yoursite.com/landing-page"
                value={utmUrl}
                onChange={(e) => setUtmUrl(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Input
                  placeholder="instagram"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Medium</Label>
                <Input
                  placeholder="social"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Campaign</Label>
                <Input
                  placeholder="summer-sale"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            {utmBuiltUrl && (
              <div className="space-y-1.5">
                <Label className="text-xs">Generated URL</Label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={utmBuiltUrl}
                    className="flex-1 text-xs px-2 py-1.5 rounded-md border bg-background font-mono truncate"
                  />
                  <Button size="sm" variant="outline" className="text-xs h-8 shrink-0" onClick={copyUtm}>
                    {utmCopied ? '✓' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-8 shrink-0" onClick={addUtmToPost}>
                    Add to post
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Time picker */}
      <div className="space-y-2">
        <Label>Time on {format(selectedDate, 'MMM d, yyyy')}</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="w-36"
          />

          {/* Quick best time button */}
          <button
            type="button"
            onClick={handleBestTime}
            disabled={bestTimeLoading}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Set to AI-recommended best time for your selected platforms"
          >
            {bestTimeLoading ? <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : '⚡'}
            Best time
          </button>
          {bestTimeApplied && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ {bestTimeApplied}</span>
          )}

          {/* Best times button */}
          <div className="relative" ref={bestTimesRef}>
            <button
              type="button"
              onClick={() => setBestTimesOpen((o) => !o)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                bestTimesOpen
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Best times
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {bestTimesOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border bg-background shadow-lg z-50 p-3 space-y-3">
                {visibleRecs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No recommendations available.</p>
                ) : (
                  visibleRecs.map((rec) => {
                    const formatH = (h: number) => rec.heatmap[h]?.label ?? (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)
                    const currentHour = parseInt(timeValue.split(':')[0] ?? '0', 10)
                    return (
                      <div key={rec.platform}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                          {rec.platform.charAt(0) + rec.platform.slice(1).toLowerCase()}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.topHours.map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => applyBestHour(h)}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                                currentHour === h
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:bg-accent hover:text-foreground text-foreground',
                              )}
                            >
                              {formatH(h)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
                <p className="text-[10px] text-muted-foreground border-t pt-2">
                  Click a time to apply it
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced options */}
      <div className="rounded-lg border border-dashed overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07 10 10 0 0 1 19.07 4.93"/>
          </svg>
          Advanced
          <span className="ml-auto text-xs">{advancedOpen ? '▲' : '▼'}</span>
        </button>

        {advancedOpen && (
          <div className="border-t p-3 space-y-3 bg-muted/20">

            {/* Campaign */}
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign</Label>
              {campaignId ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border font-medium"
                    style={{ borderColor: campaigns.find(c => c.id === campaignId)?.color, color: campaigns.find(c => c.id === campaignId)?.color }}>
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: campaigns.find(c => c.id === campaignId)?.color }} />
                    {campaigns.find(c => c.id === campaignId)?.name}
                  </span>
                  <button type="button" onClick={() => setCampaignId(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Remove</button>
                </div>
              ) : creatingCampaign ? (
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 h-8 text-xs border rounded px-2 bg-background outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Campaign name…"
                    value={campaignInput}
                    onChange={e => setCampaignInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateCampaign(); if (e.key === 'Escape') setCreatingCampaign(false) }}
                    autoFocus
                  />
                  <button type="button" onClick={handleCreateCampaign} className="px-2.5 h-8 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Create</button>
                  <button type="button" onClick={() => setCreatingCampaign(false)} className="px-2 h-8 text-xs rounded border text-muted-foreground hover:text-foreground transition-colors">✕</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {campaigns.map(c => (
                    <button key={c.id} type="button" onClick={() => setCampaignId(c.id)}
                      className="text-xs px-2.5 py-1 rounded-full border hover:opacity-80 transition-opacity font-medium"
                      style={{ borderColor: c.color, color: c.color }}>
                      {c.name}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCreatingCampaign(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                    + New campaign
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">First Comment</Label>
              <Textarea
                placeholder="Automatically post this as the first comment after publishing"
                value={firstComment}
                onChange={(e) => setFirstComment(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Automatically post this as the first comment after publishing
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Repeat</Label>
              <select
                value={recurrenceFreq}
                onChange={(e) => setRecurrenceFreq(e.target.value)}
                className="w-full text-xs h-8 rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="none">Don&apos;t repeat</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              {recurrenceFreq !== 'none' && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End date (optional)</Label>
                  <Input
                    type="date"
                    value={recurrenceEndsAt}
                    onChange={(e) => setRecurrenceEndsAt(e.target.value)}
                    className="h-8 text-xs"
                    min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                  />
                  <p className="text-[11px] text-muted-foreground">Leave blank to repeat indefinitely</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {/* SafeGuard */}
      {!safeGuardDismissed && (() => {
        const status = overallSafeGuardStatus()
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSafetyScan}
                disabled={safeGuardLoading || !content.trim() || selectedPlatforms.length === 0}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors',
                  safeGuardLoading || !content.trim() || selectedPlatforms.length === 0
                    ? 'text-muted-foreground border-border cursor-not-allowed opacity-50'
                    : 'text-foreground border-border hover:bg-accent',
                )}
              >
                {safeGuardLoading ? (
                  <><span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> Scanning…</>
                ) : (
                  <>🛡️ Safety scan</>
                )}
              </button>

              {status && (
                <>
                  <button
                    type="button"
                    onClick={() => setSafeGuardExpanded((o) => !o)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors',
                      status === 'clear'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                        : status === 'warning'
                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                    )}
                  >
                    {status === 'clear' ? '✅ Clear' : status === 'warning' ? '⚠️ Warning' : '🚨 Risk'}
                    <span className="opacity-60">{safeGuardExpanded ? '▲' : '▼'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSafeGuardDismissed(true); setSafeGuardReport(null) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>

            {/* Expanded flags */}
            {safeGuardExpanded && safeGuardReport && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                {Object.entries(safeGuardReport).map(([platform, result]) => (
                  <div key={platform}>
                    <p className="font-semibold uppercase tracking-wide text-muted-foreground text-[10px] mb-1">{platform}</p>
                    {result.flags.length === 0 ? (
                      <p className="text-emerald-600 dark:text-emerald-400">✓ No issues detected</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {result.flags.map((flag, i) => (
                          <li key={i} className={cn(
                            'flex items-start gap-1.5',
                            result.status === 'risk' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
                          )}>
                            <span className="mt-0.5">→</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Risk confirmation prompt */}
            {riskConfirmPending && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  🚨 High-risk content detected — publish anyway?
                </p>
                <p className="text-xs text-muted-foreground">
                  This post has been flagged as potentially policy-violating. Publishing will be logged for review.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (riskConfirmPending === 'schedule') handleSubmit()
                      else handleQueueSchedule()
                    }}
                    className="text-xs px-2.5 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Publish anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setRiskConfirmPending(null)}
                    className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <div className="flex justify-end gap-2 pt-1 flex-wrap items-center">
        {draftId && (
          <p className="text-xs text-muted-foreground mr-auto">
            {draftSaving ? 'Saving draft…' : draftSavedAt ? `Draft saved ${formatDistanceToNow(draftSavedAt, { addSuffix: true })}` : 'Draft'}
          </p>
        )}
        {recurrenceFreq !== 'none' && (
          <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">
            🔁 Repeats {recurrenceFreq}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={saveDraft} disabled={draftSaving || !content.trim()}>
          {draftSaving ? 'Saving…' : '📝 Save Draft'}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={loading || queueLoading}>Cancel</Button>
        <Button
          variant="outline"
          onClick={handleQueueSchedule}
          disabled={loading || queueLoading || content.length > charLimit}
          title="Find next open queue slot and schedule automatically"
        >
          {queueLoading ? 'Finding slot…' : '📋 Add to Queue'}
        </Button>
        <Button onClick={handleSubmit} disabled={loading || queueLoading || content.length > charLimit}>
          {loading ? 'Scheduling…' : 'Schedule Post'}
        </Button>
      </div>

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <MediaLibraryModal
          token={token}
          workspaceId={workspaceId}
          onSelect={(url) => {
            // Find the first empty slot or add a new one
            const emptyIdx = mediaUrls.findIndex((u) => !u.trim())
            if (emptyIdx !== -1) {
              const next = [...mediaUrls]
              next[emptyIdx] = url
              setMediaUrls(next)
            } else {
              setMediaUrls((prev) => [...prev, url])
            }
            setShowMediaLibrary(false)
          }}
          onClose={() => setShowMediaLibrary(false)}
        />
      )}
    </div>

    {/* Live preview panel — desktop only */}
    <div className="hidden lg:block">
      <PostPreview
        content={content}
        mediaUrls={mediaUrls.filter((u) => u.trim().length > 0)}
        platforms={selectedPlatforms}
        scheduledFor={scheduledDateTime}
      />
    </div>
    </div>

    <UpgradeModal
      open={upgradeOpen}
      onClose={() => setUpgradeOpen(false)}
      featureName={upgradeFeature}
      message={upgradeMessage}
    />
    </>
  )
}
