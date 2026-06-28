'use client'

import { useState, useRef, useCallback } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context/WorkspaceContext'

const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const
type Platform = (typeof VALID_PLATFORMS)[number]

interface ParsedRow {
  content: string
  platforms: string[]
  scheduledFor: string        // ISO string or raw input
  mediaUrls: string[]
  // client-side validation
  errors: string[]
}

interface RowError { row: number; errors: string[] }

interface Props { token: string }

const CSV_TEMPLATE = `content,platforms,scheduled_for,media_urls
"Exciting news — our summer sale starts today! 🎉","FACEBOOK,INSTAGRAM","${format(new Date(Date.now() + 86400000), "yyyy-MM-dd'T'HH:mm")}",""
"Don't miss out — limited time offer ends soon.","X","${format(new Date(Date.now() + 172800000), "yyyy-MM-dd'T'HH:mm")}",""`

function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return []

  // Detect header and skip it
  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('content') || firstLine.includes('platform')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines
    .map((line): ParsedRow | null => {
      if (!line.trim()) return null

      // Simple CSV parser that handles quoted fields
      const fields = parseCSVLine(line)
      const [content = '', platformsRaw = '', scheduledForRaw = '', mediaUrlsRaw = ''] = fields

      const platforms = platformsRaw
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)

      const mediaUrls = mediaUrlsRaw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean)

      // Normalize the date — accept many formats
      let scheduledFor = scheduledForRaw.trim()
      const parsed = new Date(scheduledFor)
      if (isValid(parsed)) {
        scheduledFor = parsed.toISOString()
      }

      const errors = validateRow({ content, platforms, scheduledFor, mediaUrls })
      return { content, platforms, scheduledFor, mediaUrls, errors }
    })
    .filter((r): r is ParsedRow => r !== null)
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field.trim())
  return fields
}

function validateRow(row: Omit<ParsedRow, 'errors'>): string[] {
  const errs: string[] = []
  if (!row.content.trim()) errs.push('Content is required')
  if (row.platforms.length === 0) errs.push('At least one platform is required')
  else {
    const bad = row.platforms.filter((p) => !VALID_PLATFORMS.includes(p as Platform))
    if (bad.length > 0) errs.push(`Unknown platforms: ${bad.join(', ')}`)
  }
  if (!row.scheduledFor) {
    errs.push('scheduled_for is required')
  } else {
    const d = new Date(row.scheduledFor)
    if (!isValid(d)) errs.push('scheduled_for is not a valid date')
    else if (d.getTime() <= Date.now()) errs.push('scheduled_for must be in the future')
  }
  return errs
}

function formatScheduled(iso: string): string {
  try {
    const d = parseISO(iso)
    return isValid(d) ? format(d, 'MMM d, yyyy · h:mm a') : iso
  } catch { return iso }
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:  'bg-blue-100 text-blue-700',
  INSTAGRAM: 'bg-pink-100 text-pink-700',
  TIKTOK:    'bg-slate-100 text-slate-700',
  X:         'bg-gray-100 text-gray-700',
  GOOGLE:    'bg-orange-100 text-orange-700',
}

export function BulkClient({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<RowError[]>([])
  const [result, setResult] = useState<{ created: number; requiresReview: boolean } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)

  function processText(text: string) {
    setCsvText(text)
    setRows(parseCSV(text))
    setServerErrors([])
    setResult(null)
    setSubmitError(null)
  }

  function handleFileRead(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => processText(e.target?.result as string)
    reader.readAsText(file)
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileRead(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileRead(file)
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'omnipulse-bulk-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function reset() {
    setCsvText('')
    setRows([])
    setServerErrors([])
    setResult(null)
    setSubmitError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = useCallback(async () => {
    if (!activeWorkspace || validRows.length === 0) return
    setSubmitting(true)
    setServerErrors([])
    setSubmitError(null)

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/bulk-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          posts: validRows.map((r) => ({
            content: r.content,
            platforms: r.platforms,
            scheduledFor: r.scheduledFor,
            mediaUrls: r.mediaUrls,
          })),
        }),
      })

      const body = (await res.json()) as {
        created?: number
        requiresReview?: boolean
        error?: string
        rowErrors?: RowError[]
      }

      if (!res.ok) {
        if (body.rowErrors) { setServerErrors(body.rowErrors); return }
        setSubmitError(body.error ?? 'Failed to schedule posts')
        return
      }

      setResult({ created: body.created ?? validRows.length, requiresReview: body.requiresReview ?? false })
      setRows([])
      setCsvText('')
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }, [activeWorkspace, validRows, token])

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Select a workspace to use bulk scheduling.</p>
  }

  // Success state
  if (result) {
    return (
      <div className="rounded-xl border-2 border-dashed p-12 text-center space-y-4">
        <div className="text-4xl">🚀</div>
        <h2 className="text-xl font-bold">
          {result.created} post{result.created !== 1 ? 's' : ''} {result.requiresReview ? 'submitted for review' : 'scheduled'}!
        </h2>
        <p className="text-sm text-muted-foreground">
          {result.requiresReview
            ? 'Posts are in the Approvals queue and will be scheduled once approved.'
            : 'Your posts are queued and will publish at their scheduled times.'}
        </p>
        <Button onClick={reset}>Import More</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['upload', 'paste'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); reset() }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'upload' ? 'Upload CSV' : 'Paste CSV'}
          </button>
        ))}
        <div className="ml-auto flex items-center pb-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="text-xs h-7">
            ↓ Download Template
          </Button>
        </div>
      </div>

      {/* Upload zone */}
      {tab === 'upload' && rows.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors space-y-3',
            dragging ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/40',
          )}
        >
          <div className="text-4xl">📂</div>
          <div>
            <p className="font-medium">Drop a CSV file here, or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">Supported columns: content, platforms, scheduled_for, media_urls</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* Paste zone */}
      {tab === 'paste' && rows.length === 0 && (
        <div className="space-y-2">
          <Textarea
            placeholder={CSV_TEMPLATE}
            value={csvText}
            onChange={(e) => processText(e.target.value)}
            rows={8}
            className="font-mono text-xs resize-y"
          />
          <p className="text-xs text-muted-foreground">
            First row can be a header (content, platforms, scheduled_for, media_urls) or data directly.
          </p>
        </div>
      )}

      {/* Format guide */}
      {rows.length === 0 && (
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CSV Format</p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="space-y-1">
              <p><span className="font-mono font-medium">content</span> — the post text (wrap in quotes if it has commas)</p>
              <p><span className="font-mono font-medium">platforms</span> — comma-separated: FACEBOOK, INSTAGRAM, TIKTOK, X, GOOGLE</p>
            </div>
            <div className="space-y-1">
              <p><span className="font-mono font-medium">scheduled_for</span> — ISO 8601 or any parseable date/time</p>
              <p><span className="font-mono font-medium">media_urls</span> — optional, comma-separated image URLs</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 dark:text-green-400 font-medium">
                ✓ {validRows.length} valid
              </span>
              {invalidRows.length > 0 && (
                <span className="text-destructive font-medium">
                  ✕ {invalidRows.length} with errors
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="text-xs h-7">
              Clear
            </Button>
          </div>

          {/* Server-side row errors */}
          {serverErrors.length > 0 && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1 text-xs text-destructive">
              <p className="font-semibold">Server validation failed:</p>
              {serverErrors.map((e) => (
                <p key={e.row}>Row {e.row}: {e.errors.join(', ')}</p>
              ))}
            </div>
          )}

          {submitError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium">Content</th>
                    <th className="text-left px-3 py-2 font-medium w-44">Platforms</th>
                    <th className="text-left px-3 py-2 font-medium w-44">Scheduled For</th>
                    <th className="text-left px-3 py-2 font-medium w-20">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'bg-background',
                        row.errors.length > 0 && 'bg-destructive/5',
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="line-clamp-2 max-w-xs">{row.content || <span className="text-muted-foreground italic">empty</span>}</p>
                        {row.errors.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.errors.map((e) => (
                              <li key={e} className="text-destructive">{e}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.platforms.map((p) => (
                            <span key={p} className={cn('px-1.5 py-0.5 rounded-full font-medium', PLATFORM_COLORS[p] ?? 'bg-muted text-muted-foreground')}>
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.scheduledFor ? formatScheduled(row.scheduledFor) : <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length === 0
                          ? <span className="text-green-600 dark:text-green-400 font-medium">✓ Ready</span>
                          : <span className="text-destructive font-medium">✕ Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted-foreground">
              {invalidRows.length > 0 && 'Rows with errors will be skipped. '}
              {validRows.length > 0 && `${validRows.length} post${validRows.length !== 1 ? 's' : ''} will be scheduled.`}
            </p>
            <Button
              onClick={handleSubmit}
              disabled={submitting || validRows.length === 0}
              className="min-w-32"
            >
              {submitting ? 'Scheduling…' : `Schedule ${validRows.length} Post${validRows.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
