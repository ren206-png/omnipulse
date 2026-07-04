'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface SeoChecklistWidgetProps {
  content: string
  platforms: string[]
  mediaUrls: string[]
  postId: string | null
  workspaceId: string
  token: string
}

interface SeoMetadata {
  metaTitle?: string | null
  metaDescription?: string | null
  keywords?: string[]
}

type CheckStatus = 'pass' | 'warn' | 'fail'

interface CheckItem {
  label: string
  status: CheckStatus
  note: string
}

function statusDot(status: CheckStatus): string {
  if (status === 'pass') return '🟢'
  if (status === 'warn') return '🟡'
  return '🔴'
}

export function SeoChecklistWidget({
  content,
  platforms,
  mediaUrls,
  postId,
  workspaceId,
  token,
}: SeoChecklistWidgetProps) {
  const [open, setOpen] = useState(false)
  const [seoData, setSeoData] = useState<SeoMetadata | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [keywordVolume, setKeywordVolume] = useState<Array<{keyword: string; searchVolume: number | null; competition: string | null; cpc: number | null}> | null>(null)
  const [kwLoading, setKwLoading] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  // Fetch SEO metadata when panel opens and postId is available
  const fetchSeo = useCallback(async () => {
    if (!postId) return
    try {
      const res = await fetch(
        `${apiUrl}/api/v1/seo/${postId}?workspaceId=${workspaceId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) return
      const data = await res.json()
      const parsed: SeoMetadata = data?.seo ?? null
      setSeoData(parsed)
      if (parsed) {
        setEditTitle(parsed.metaTitle ?? '')
        setEditDescription(parsed.metaDescription ?? '')
      }
    } catch {
      // silently ignore
    }
  }, [postId, workspaceId, token, apiUrl])

  const fetchKeywordVolume = useCallback(async (keywords: string[]) => {
    if (!keywords.length) return
    setKwLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/seo-data/keyword-volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId, keywords }),
      })
      if (!res.ok) return
      const data = await res.json()
      setKeywordVolume(data?.results ?? null)
    } catch {
      // silently fail
    } finally {
      setKwLoading(false)
    }
  }, [apiUrl, token, workspaceId])

  useEffect(() => {
    if (open && postId) {
      fetchSeo()
    }
  }, [open, postId, fetchSeo])

  useEffect(() => {
    if (open && seoData?.keywords?.length) {
      fetchKeywordVolume(seoData.keywords)
    }
  }, [open, seoData, fetchKeywordVolume])

  async function handleGenerate() {
    if (!postId) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/seo/${postId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId }),
      })
      if (!res.ok) {
        setGenerateError('Generation failed. Please try again.')
        return
      }
      await fetchSeo()
    } catch {
      setGenerateError('Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!postId) return
    setSaveStatus('saving')
    try {
      const res = await fetch(`${apiUrl}/api/v1/seo/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId, metaTitle: editTitle, metaDescription: editDescription }),
      })
      if (!res.ok) {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 2000)
        return
      }
      setSeoData((prev) => prev ? { ...prev, metaTitle: editTitle, metaDescription: editDescription } : prev)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  // Compute checklist items from props + seoData
  function buildChecklist(): CheckItem[] {
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0
    const charCount = content.length
    const hasMedia = mediaUrls.filter((u) => u.trim()).length > 0
    const hasHashtags = content.includes('#')
    const hasSeo = seoData !== null
    const hasMetaTitle = hasSeo && !!seoData?.metaTitle
    const hasMetaDesc = hasSeo && !!seoData?.metaDescription
    const keywordCount = hasSeo ? (seoData?.keywords?.length ?? 0) : 0
    const hasKeywords = keywordCount > 0

    const checks: CheckItem[] = []

    // 1. Word count
    checks.push({
      label: 'Word count',
      status: wordCount >= 5 ? 'pass' : wordCount >= 1 ? 'warn' : 'fail',
      note:
        wordCount === 0
          ? 'No content yet'
          : `${wordCount} word${wordCount !== 1 ? 's' : ''}`,
    })

    // 2. Character count
    const xSelected = platforms.includes('X')
    checks.push({
      label: 'Character count',
      status: charCount === 0 ? 'warn' : xSelected && charCount > 280 ? 'warn' : 'pass',
      note:
        charCount > 280 && xSelected
          ? `${charCount} chars — may be truncated on X`
          : `${charCount} chars`,
    })

    // 3. Has media
    checks.push({
      label: 'Has media',
      status: hasMedia ? 'pass' : 'warn',
      note: hasMedia ? 'Media attached' : 'Add an image to improve engagement',
    })

    // 4. Has hashtags
    checks.push({
      label: 'Hashtags',
      status: hasHashtags ? 'pass' : 'warn',
      note: hasHashtags ? 'Hashtags found' : 'Add hashtags to improve reach',
    })

    // 5. Meta title
    checks.push({
      label: 'Meta title',
      status: hasMetaTitle ? 'pass' : 'warn',
      note: hasMetaTitle ? seoData!.metaTitle! : 'Not generated yet',
    })

    // 6. Meta description
    checks.push({
      label: 'Meta description',
      status: hasMetaDesc ? 'pass' : 'warn',
      note: hasMetaDesc ? 'Set' : 'Not generated yet',
    })

    // 7. Keywords
    checks.push({
      label: 'Keywords',
      status: hasKeywords ? 'pass' : 'warn',
      note: hasKeywords ? `${keywordCount} keyword${keywordCount !== 1 ? 's' : ''} found` : 'Not generated yet',
    })

    // 8. Alt text (proxy: no media = N/A, media present but no SEO = warn)
    checks.push({
      label: 'Alt text',
      status: !hasMedia ? 'pass' : hasSeo ? 'pass' : 'warn',
      note: !hasMedia ? 'N/A — no media' : hasSeo ? 'Available via SEO metadata' : 'Generate SEO to add alt text',
    })

    return checks
  }

  const checklist = buildChecklist()
  const isEmpty = !content.trim()

  return (
    <div className="rounded-lg border border-dashed overflow-hidden">
      {/* Toggle button — matches the advancedOpen pattern exactly */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        SEO Checklist
        <span className="ml-auto text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t p-3 space-y-3 bg-muted/20">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground italic">
              Start writing to see SEO checks
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-start gap-2 text-xs">
                    <span className="mt-px leading-none" aria-hidden="true">
                      {statusDot(item.status)}
                    </span>
                    <span className="font-medium w-32 shrink-0 text-foreground">
                      {item.label}
                    </span>
                    <span className="text-muted-foreground flex-1 truncate" title={item.note}>
                      {item.note}
                    </span>
                  </div>
                ))}
              </div>

              {postId && (
                <div className="border-t pt-2 space-y-1.5">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors text-violet-600 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating ? (
                      <>
                        <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        Generating…
                      </>
                    ) : (
                      'Generate SEO Metadata'
                    )}
                  </button>
                  {generateError && (
                    <p className="text-xs text-destructive">{generateError}</p>
                  )}
                </div>
              )}

              {!postId && (
                <p className="text-xs text-muted-foreground border-t pt-2 italic">
                  Save the post as a draft to generate SEO metadata.
                </p>
              )}

              {seoData && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-medium text-foreground">SEO Metadata</p>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Meta Title</Label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={`h-8 text-xs ${editTitle.length > 60 ? 'border-destructive' : ''}`}
                      placeholder="Meta title..."
                    />
                    <p className={`text-xs ${editTitle.length > 60 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {editTitle.length}/60
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Meta Description</Label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className={`min-h-[60px] text-xs ${editDescription.length > 160 ? 'border-destructive' : ''}`}
                      placeholder="Meta description..."
                    />
                    <p className={`text-xs ${editDescription.length > 160 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {editDescription.length}/160
                    </p>
                  </div>
                  {(seoData.keywords?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Keywords</Label>
                      <div className="flex flex-wrap gap-1">
                        {seoData.keywords!.map((kw) => (
                          <span key={kw} className="bg-muted rounded px-2 py-0.5 text-xs">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={
                        saveStatus === 'saving' ||
                        (editTitle === (seoData.metaTitle ?? '') && editDescription === (seoData.metaDescription ?? ''))
                      }
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors text-violet-600 border-violet-300 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-700 dark:hover:bg-violet-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saveStatus === 'saving' ? 'Saving…' : 'Save Changes'}
                    </button>
                    {saveStatus === 'saved' && <span className="text-xs text-green-600">✅ Saved</span>}
                    {saveStatus === 'error' && <span className="text-xs text-destructive">❌ Failed to save</span>}
                  </div>
                </div>
              )}

              {seoData && (seoData.keywords?.length ?? 0) > 0 && (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">Keyword Insights</p>
                  {kwLoading ? (
                    <p className="text-xs text-muted-foreground italic">Loading keyword insights...</p>
                  ) : keywordVolume && keywordVolume.length > 0 ? (
                    <div className="space-y-1.5">
                      {keywordVolume.map((kw) => (
                        <div key={kw.keyword} className="flex items-center gap-2 text-xs">
                          <span className="font-medium w-28 shrink-0 truncate text-foreground" title={kw.keyword}>
                            {kw.keyword}
                          </span>
                          <span className="text-muted-foreground w-16 shrink-0">
                            {kw.searchVolume != null ? kw.searchVolume.toLocaleString() : '—'}
                          </span>
                          <span className="w-14 shrink-0">
                            {kw.competition === 'low' ? (
                              <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded px-1.5 py-0.5 text-xs">low</span>
                            ) : kw.competition === 'medium' ? (
                              <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded px-1.5 py-0.5 text-xs">med</span>
                            ) : kw.competition === 'high' ? (
                              <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded px-1.5 py-0.5 text-xs">high</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {kw.cpc != null ? `$${kw.cpc.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
