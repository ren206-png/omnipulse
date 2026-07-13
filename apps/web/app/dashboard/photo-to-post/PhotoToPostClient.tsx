'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: 'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
  X: 'bg-gray-100 text-gray-700',
  GOOGLE: 'bg-orange-100 text-orange-700',
  LINKEDIN: 'bg-sky-100 text-sky-700',
}

interface GuardrailResult {
  clean: boolean
  flags: string[]
}

interface PostVariant {
  platform: string
  caption: string
  hashtags: string[]
  suggestedScheduleTime: string
}

interface GenerateResult {
  variants: PostVariant[]
}

type Step = 1 | 2 | 3

export function PhotoToPostClient({ token }: { token: string }) {
  const { workspaces, activeWorkspace } = useWorkspace()

  const [step, setStep] = useState<Step>(1)
  const [photoUrl, setPhotoUrl] = useState('')
  const [workspaceId, setWorkspaceId] = useState(activeWorkspace?.id ?? '')

  // Step 2
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [guardrail, setGuardrail] = useState<GuardrailResult | null>(null)
  const [proceedAnyway, setProceedAnyway] = useState(false)

  // Step 3
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [variants, setVariants] = useState<PostVariant[]>([])
  const [variantStates, setVariantStates] = useState<Record<number, 'idle' | 'approved' | 'discarded'>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function handleAnalyze() {
    if (!photoUrl.trim()) {
      setAnalyzeError('Please enter a photo URL.')
      return
    }
    const wsId = workspaceId || activeWorkspace?.id
    if (!wsId) {
      setAnalyzeError('Please select a workspace.')
      return
    }
    setAnalyzeLoading(true)
    setAnalyzeError(null)
    try {
      const res = await fetch(`${apiUrl}/api/v1/photo-to-post/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photoUrl, workspaceId: wsId }),
      })
      const data = (await res.json()) as { guardrail?: GuardrailResult; error?: string }
      if (!res.ok) {
        setAnalyzeError(data.error ?? 'Failed to analyze photo')
        return
      }
      const result = data.guardrail ?? { clean: true, flags: [] }
      setGuardrail(result)
      setStep(2)
      if (result.clean) {
        // Auto-advance to generate
        await handleGenerate(wsId, false)
      }
    } catch {
      setAnalyzeError('Network error — please try again')
    } finally {
      setAnalyzeLoading(false)
    }
  }

  async function handleGenerate(wsId?: string, proceed?: boolean) {
    const wid = wsId ?? workspaceId ?? activeWorkspace?.id ?? ''
    const proceedFlag = proceed ?? proceedAnyway
    setGenerateLoading(true)
    setGenerateError(null)
    setStep(3)
    try {
      const res = await fetch(`${apiUrl}/api/v1/photo-to-post/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ photoUrl, workspaceId: wid, proceedDespiteFlags: proceedFlag }),
      })
      const data = (await res.json()) as GenerateResult & { error?: string }
      if (!res.ok) {
        setGenerateError(data.error ?? 'Failed to generate variants')
        return
      }
      setVariants(data.variants ?? [])
      setVariantStates({})
    } catch {
      setGenerateError('Network error — please try again')
    } finally {
      setGenerateLoading(false)
    }
  }

  async function approveVariant(idx: number) {
    setVariantStates((prev) => ({ ...prev, [idx]: 'approved' }))
    showToast('Variant saved as draft')
  }

  function discardVariant(idx: number) {
    setVariantStates((prev) => ({ ...prev, [idx]: 'discarded' }))
  }

  async function saveAllDrafts() {
    setSavingAll(true)
    const pending = variants.filter((_, i) => variantStates[i] !== 'discarded')
    const newStates: Record<number, 'idle' | 'approved' | 'discarded'> = {}
    variants.forEach((_, i) => {
      if (variantStates[i] !== 'discarded') {
        newStates[i] = 'approved'
      } else {
        newStates[i] = 'discarded'
      }
    })
    setVariantStates(newStates)
    setSavingAll(false)
    showToast(`${pending.length} variant${pending.length !== 1 ? 's' : ''} saved as drafts`)
  }

  function reset() {
    setStep(1)
    setPhotoUrl('')
    setGuardrail(null)
    setProceedAnyway(false)
    setVariants([])
    setVariantStates({})
    setAnalyzeError(null)
    setGenerateError(null)
  }

  const wsId = workspaceId || activeWorkspace?.id

  return (
    <div className="max-w-2xl space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-foreground text-background text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {step > s ? '✓' : s}
            </div>
            <span className={cn('text-sm', step === s ? 'font-semibold' : 'text-muted-foreground')}>
              {s === 1 ? 'Upload' : s === 2 ? 'Guardrails' : 'Variants'}
            </span>
            {s < 3 && <span className="text-muted-foreground mx-1">›</span>}
          </div>
        ))}
      </div>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Step 1: Upload a Photo</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">Photo URL</label>
            <Input
              placeholder="https://example.com/photo.jpg"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze() }}
            />
          </div>

          {photoUrl && (
            <div className="rounded-md overflow-hidden border w-full max-h-48 flex items-center justify-center bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Preview"
                className="max-h-48 w-auto object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Workspace</label>
            <Select value={wsId ?? ''} onValueChange={setWorkspaceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {analyzeError && (
            <p className="text-sm text-destructive">{analyzeError}</p>
          )}

          <Button onClick={handleAnalyze} disabled={analyzeLoading} className="w-full">
            {analyzeLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                Analyzing…
              </span>
            ) : (
              '📸 Analyze Photo'
            )}
          </Button>
        </div>
      )}

      {/* Step 2 — Guardrails */}
      {step === 2 && guardrail && !guardrail.clean && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold text-base">Step 2: Guardrail Check</h2>

          <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 p-4 space-y-2">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300 font-medium text-sm">
              <span>⚠️</span>
              <span>This photo has been flagged</span>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {guardrail.flags.map((flag) => (
                <li key={flag} className="text-sm text-yellow-700 dark:text-yellow-400">{flag}</li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 mt-0.5 rounded border-border cursor-pointer"
              checked={proceedAnyway}
              onChange={(e) => setProceedAnyway(e.target.checked)}
            />
            <span className="text-sm">I understand the flags and want to proceed anyway</span>
          </label>

          <div className="flex gap-3">
            <Button
              disabled={!proceedAnyway || generateLoading}
              onClick={() => handleGenerate()}
              className="flex-1"
            >
              {generateLoading ? 'Generating…' : 'Confirm & Generate Variants'}
            </Button>
            <Button variant="outline" onClick={reset}>
              Start Over
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Variants */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Step 3: Post Variants</h2>
            <Button variant="outline" size="sm" onClick={reset}>Start Over</Button>
          </div>

          {generateLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {generateError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
              <span>{generateError}</span>
              <Button variant="ghost" size="sm" onClick={() => handleGenerate()}>Retry</Button>
            </div>
          )}

          {!generateLoading && !generateError && variants.length === 0 && (
            <div className="rounded-xl border-2 border-dashed p-10 text-center space-y-2">
              <p className="text-muted-foreground text-sm">No variants generated.</p>
              <Button variant="outline" size="sm" onClick={() => handleGenerate()}>Try Again</Button>
            </div>
          )}

          {!generateLoading && variants.length > 0 && (
            <>
              <div className="space-y-3">
                {variants.map((v, i) => {
                  const state = variantStates[i] ?? 'idle'
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg border bg-card p-4 space-y-3 transition-opacity',
                        state === 'discarded' && 'opacity-40',
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          PLATFORM_COLORS[v.platform] ?? 'bg-muted text-muted-foreground',
                        )}>
                          {v.platform}
                        </span>
                        {state === 'approved' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            ✓ Draft saved
                          </span>
                        )}
                        {state === 'discarded' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                            Discarded
                          </span>
                        )}
                        {v.suggestedScheduleTime && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            📅 {v.suggestedScheduleTime}
                          </span>
                        )}
                      </div>

                      {/* Caption */}
                      <p className="text-sm leading-relaxed">{v.caption}</p>

                      {/* Hashtags */}
                      {v.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {v.hashtags.map((tag, ti) => (
                            <span
                              key={ti}
                              className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium"
                            >
                              {tag.startsWith('#') ? tag : `#${tag}`}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {state === 'idle' && (
                        <div className="flex gap-2 pt-1 border-t">
                          <Button size="sm" className="h-7 text-xs" onClick={() => approveVariant(i)}>
                            ✓ Approve to Draft
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => discardVariant(i)}>
                            ✕ Discard
                          </Button>
                        </div>
                      )}
                      {state !== 'idle' && (
                        <div className="pt-1 border-t">
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setVariantStates((prev) => ({ ...prev, [i]: 'idle' }))}
                          >
                            Undo
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <Button className="w-full" onClick={saveAllDrafts} disabled={savingAll}>
                {savingAll ? 'Saving…' : '💾 Save All as Drafts'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
