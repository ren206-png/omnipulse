'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '../context/WorkspaceContext'

const VALID_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE', 'LINKEDIN'] as const
type Platform = (typeof VALID_PLATFORMS)[number]

interface ParsedRow {
  content: string
  platforms: string[]
  scheduledFor: string
  mediaUrls: string[]
  errors: string[]
}

interface ServerRowError {
  row: number
  message: string
}

interface Props {
  token: string
}

const CSV_TEMPLATE = `content,platforms,scheduled_for,media_urls
"Your first post","FACEBOOK,INSTAGRAM","2026-07-15 09:00",""
"Another post","X","2026-07-16 10:30",""`

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

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

function normalizeDate(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // Try direct parse first (handles ISO 8601 and most formats)
  const d = new Date(trimmed)
  if (!isNaN(d.getTime())) return d.toISOString()
  // Try "YYYY-MM-DD HH:mm" style without T separator
  const withT = trimmed.replace(' ', 'T')
  const d2 = new Date(withT)
  if (!isNaN(d2.getTime())) return d2.toISOString()
  return trimmed // return raw so validation can flag it
}

function validateRow(row: Omit<ParsedRow, 'errors'>): string[] {
  const errs: string[] = []
  if (!row.content.trim()) errs.push('content is required')
  if (row.platforms.length === 0) {
    errs.push('at least one platform is required')
  } else {
    const bad = row.platforms.filter((p) => !VALID_PLATFORMS.includes(p as Platform))
    if (bad.length > 0) errs.push(`unknown platform(s): ${bad.join(', ')}`)
  }
  if (!row.scheduledFor) {
    errs.push('scheduled_for is required')
  } else {
    const d = new Date(row.scheduledFor)
    if (isNaN(d.getTime())) errs.push('invalid date')
  }
  return errs
}

function parseCSV(raw: string): ParsedRow[] {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return []

  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('content') || firstLine.includes('platform')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines
    .map((line): ParsedRow | null => {
      if (!line.trim()) return null
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

      const scheduledFor = normalizeDate(scheduledForRaw)
      const errors = validateRow({ content, platforms, scheduledFor, mediaUrls })
      return { content, platforms, scheduledFor, mediaUrls, errors }
    })
    .filter((r): r is ParsedRow => r !== null)
}

function formatScheduled(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  INSTAGRAM: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  TIKTOK:    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  X:         'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  GOOGLE:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  LINKEDIN:  'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkImportClient({ token }: Props) {
  const { activeWorkspace } = useWorkspace()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState<ServerRowError[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successCount, setSuccessCount] = useState<number | null>(null)

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)

  function handleFile(file: File) {
    setFileName(file.name)
    setServerErrors([])
    setSubmitError(null)
    setSuccessCount(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setRows(parseCSV(text))
    }
    reader.readAsText(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'omnipulse-bulk-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function reset() {
    setRows([])
    setFileName(null)
    setServerErrors([])
    setSubmitError(null)
    setSuccessCount(null)
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        posts?: unknown[]
        errors?: ServerRowError[]
        error?: string
        message?: string
      }

      if (!res.ok) {
        if (body.errors && body.errors.length > 0) {
          setServerErrors(body.errors)
          return
        }
        setSubmitError(body.error ?? body.message ?? 'Failed to schedule posts')
        return
      }

      const count = body.posts?.length ?? validRows.length
      setSuccessCount(count)
      setRows([])
      setFileName(null)
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }, [activeWorkspace, validRows, token])

  // ------------------------------------------------------------------
  // No workspace selected
  // ------------------------------------------------------------------
  if (!activeWorkspace) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a workspace from the sidebar to use bulk import.
      </p>
    )
  }

  // ------------------------------------------------------------------
  // Success state
  // ------------------------------------------------------------------
  if (successCount !== null) {
    return (
      <div className="rounded-lg border p-12 text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-semibold">
          {successCount} post{successCount !== 1 ? 's' : ''} scheduled successfully
        </h2>
        <p className="text-sm text-muted-foreground">
          Your posts are queued and will publish at their scheduled times.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/dashboard/calendar">
            <Button variant="default">View Calendar</Button>
          </Link>
          <Button variant="outline" onClick={reset}>
            Import Another File
          </Button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Main UI
  // ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Helper text + template download */}
      <div className="rounded-lg border p-4 bg-muted/40 space-y-2">
        <p className="text-sm font-medium">CSV format</p>
        <p className="text-xs text-muted-foreground">
          Required columns: <code className="bg-muted px-1 rounded">content</code>,{' '}
          <code className="bg-muted px-1 rounded">platforms</code>,{' '}
          <code className="bg-muted px-1 rounded">scheduled_for</code>,{' '}
          <code className="bg-muted px-1 rounded">media_urls</code> (optional)
        </p>
        <p className="text-xs text-muted-foreground">
          Supported platforms:{' '}
          {VALID_PLATFORMS.map((p) => (
            <span key={p} className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${PLATFORM_COLORS[p] ?? 'bg-muted text-foreground'}`}>
              {p}
            </span>
          ))}
        </p>
        <p className="text-xs text-muted-foreground">
          Example row:{' '}
          <code className="bg-muted px-1 rounded text-xs">
            {`"Check out our summer sale!","FACEBOOK,INSTAGRAM","2026-07-15 09:00",""`}
          </code>
        </p>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="mt-1">
          Download CSV Template
        </Button>
      </div>

      {/* File upload */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Upload CSV file</label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="block text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-accent cursor-pointer"
          />
          {fileName && (
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">
              Clear
            </button>
          )}
        </div>
        {fileName && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Parsing…</p>
        )}
      </div>

      {/* Parse errors summary */}
      {invalidRows.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-1">
          <p className="text-sm font-medium text-destructive">
            {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors (will be skipped)
          </p>
          {rows.map((row, i) =>
            row.errors.map((err, j) => (
              <p key={`${i}-${j}`} className="text-xs text-destructive">
                Row {i + 1}: {err}
              </p>
            ))
          )}
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Preview — {validRows.length} valid post{validRows.length !== 1 ? 's' : ''} of {rows.length} total
          </p>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Content</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Platforms</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Scheduled</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={i} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <span className="block truncate" title={row.content}>
                        {row.content.slice(0, 50)}{row.content.length > 50 ? '…' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.platforms.map((p) => (
                          <span
                            key={p}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PLATFORM_COLORS[p] ?? 'bg-muted text-foreground'}`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {formatScheduled(row.scheduledFor)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.length > 0 ? (
                        <span className="text-destructive" title={row.errors.join('; ')}>
                          ✕ {row.errors[0]}{row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Server errors */}
      {serverErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-1">
          <p className="text-sm font-medium text-destructive">Server validation errors</p>
          {serverErrors.map((e, i) => (
            <p key={i} className="text-xs text-destructive">
              Row {e.row}: {e.message}
            </p>
          ))}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <p className="text-sm text-destructive">{submitError}</p>
      )}

      {/* Actions */}
      {validRows.length > 0 && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Scheduling…' : `Schedule ${validRows.length} Post${validRows.length !== 1 ? 's' : ''}`}
          </Button>
          <Button variant="outline" onClick={reset} disabled={submitting}>
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
