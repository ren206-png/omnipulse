'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Toast, ToastTitle, ToastDescription, ToastClose } from '@/components/ui/toast'
import { CreatePostForm } from './CreatePostForm'
import { cn } from '@/lib/utils'

interface PostMetric {
  platform: string
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
}

interface Post {
  id: string
  scheduledFor: string
  content: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'
  platforms: string[]
  reviewNote: string | null
  metrics: PostMetric[]
  evergreen: boolean
  evergreenInterval: number | null
}

interface Props {
  workspaceId: string
  token: string
  activeWorkspaceId?: string
}

const STATUS_DOT: Record<Post['status'], string> = {
  DRAFT:          'bg-muted-foreground',
  PENDING_REVIEW: 'bg-yellow-500',
  APPROVED:       'bg-teal-500',
  SCHEDULED:      'bg-blue-500',
  PUBLISHED:      'bg-green-500',
  FAILED:         'bg-red-500',
}

const STATUS_LABEL: Record<Post['status'], string> = {
  DRAFT:          'Draft',
  PENDING_REVIEW: 'Pending Review',
  APPROVED:       'Approved',
  SCHEDULED:      'Scheduled',
  PUBLISHED:      'Published',
  FAILED:         'Failed',
}

export function CalendarClient({ workspaceId, token, activeWorkspaceId }: Props) {
  const exportIcal = () => {
    const id = activeWorkspaceId ?? workspaceId
    if (!id) return
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/posts/ical?workspaceId=${id}`,
      '_blank',
    )
  }
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [posts, setPosts] = useState<Post[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null)
  const [evergreenPostId, setEvergreenPostId] = useState<string | null>(null)
  const [evergreenDays, setEvergreenDays] = useState('30')
  const [evergreenLoading, setEvergreenLoading] = useState(false)

  const fetchPosts = useCallback(async () => {
    setFetchError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = (await res.json()) as { posts: Post[] }
      setPosts(data.posts)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load posts')
    }
  }, [workspaceId, token])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const paddingDays = Array.from({ length: startOfMonth(currentMonth).getDay() })

  function handleDayClick(day: Date) {
    setSelectedDate(day)
    setShowCreateForm(false)
    setFormKey((k) => k + 1) // reset form state for the new date
    setDialogOpen(true)
  }

  function handlePostSuccess(requiresReview?: boolean) {
    fetchPosts()
    setDialogOpen(false)
    setShowCreateForm(false)
    setToastMessage(requiresReview ? 'Post submitted for review!' : 'Post scheduled successfully!')
    setToastOpen(true)
  }

  function startEdit(post: Post) {
    setEditingPostId(post.id)
    setEditContent(post.content)
    setEditTime(format(new Date(post.scheduledFor), 'HH:mm'))
    setEditError(null)
  }

  function cancelEdit() {
    setEditingPostId(null)
    setEditContent('')
    setEditTime('')
    setEditError(null)
  }

  async function handleSaveEdit(post: Post) {
    setEditLoading(true)
    setEditError(null)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const [hours, minutes] = editTime.split(':').map(Number)
      const scheduledDate = new Date(post.scheduledFor)
      scheduledDate.setHours(hours, minutes, 0, 0)

      const res = await fetch(`${apiUrl}/api/v1/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editContent, scheduledFor: scheduledDate.toISOString() }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setEditError(body.error ?? 'Failed to update post')
        return
      }
      cancelEdit()
      fetchPosts()
      setToastMessage('Post updated successfully!')
      setToastOpen(true)
    } catch {
      setEditError('Network error — please try again')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleSubmitReview(postId: string) {
    setSubmittingReviewId(postId)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/submit-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setToastMessage(body.error ?? 'Failed to submit for review')
        setToastOpen(true)
        return
      }
      fetchPosts()
      setToastMessage('Post submitted for review!')
      setToastOpen(true)
    } catch {
      setToastMessage('Network error — please try again')
      setToastOpen(true)
    } finally {
      setSubmittingReviewId(null)
    }
  }

  async function handleDelete(postId: string) {
    setDeletingPostId(postId)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setToastMessage(body.error ?? 'Failed to delete post')
        setToastOpen(true)
        return
      }
      fetchPosts()
      setToastMessage('Post deleted.')
      setToastOpen(true)
    } catch {
      setToastMessage('Network error — could not delete post')
      setToastOpen(true)
    } finally {
      setDeletingPostId(null)
    }
  }

  async function handleSetEvergreen(postId: string, enabled: boolean, days: number) {
    setEvergreenLoading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    try {
      const res = await fetch(`${apiUrl}/api/v1/posts/${postId}/evergreen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ evergreen: enabled, intervalDays: days }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setToastMessage(body.error ?? 'Failed to update evergreen setting')
        setToastOpen(true)
        return
      }
      const data = (await res.json()) as { post: Post }
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, evergreen: data.post.evergreen, evergreenInterval: data.post.evergreenInterval } : p)))
      setEvergreenPostId(null)
      setToastMessage(enabled ? `Evergreen enabled — will recycle every ${days} days` : 'Evergreen removed')
      setToastOpen(true)
    } catch {
      setToastMessage('Network error — please try again')
      setToastOpen(true)
    } finally {
      setEvergreenLoading(false)
    }
  }

  const selectedDayPosts = selectedDate
    ? posts.filter((p) => isSameDay(new Date(p.scheduledFor), selectedDate))
    : []

  const selectedDayIsPast = selectedDate
    ? selectedDate < new Date(new Date().setHours(0, 0, 0, 0))
    : false

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            ‹ Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            Next ›
          </Button>
          <Button variant="outline" size="sm" onClick={exportIcal} title="Export calendar as iCal (.ics)">
            📅 Export iCal
          </Button>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>Failed to load posts: {fetchError}</span>
          <Button variant="ghost" size="sm" onClick={fetchPosts}>Retry</Button>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {(Object.entries(STATUS_LABEL) as [Post['status'], string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn('inline-block w-2 h-2 rounded-full', STATUS_DOT[status])} />
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-xs font-medium text-center text-muted-foreground">
            {d}
          </div>
        ))}

        {paddingDays.map((_, i) => (
          <div key={`pad-${i}`} className="bg-background min-h-[80px]" />
        ))}

        {days.map((day) => {
          const dayPosts = posts.filter((p) => isSameDay(new Date(p.scheduledFor), day))
          const isToday = isSameDay(day, new Date())
          const isPast = day < new Date(new Date().setHours(0, 0, 0, 0)) && !isToday
          return (
            <div
              key={day.toISOString()}
              onClick={() => handleDayClick(day)}
              className={cn(
                'bg-background min-h-[80px] p-1.5 cursor-pointer hover:bg-accent/50 transition-colors',
                isToday && 'ring-1 ring-inset ring-primary',
                isPast && 'opacity-40',
              )}
            >
              <span className={cn(
                'text-xs font-medium',
                isToday && 'text-primary font-bold',
              )}>
                {format(day, 'd')}
              </span>

              {dayPosts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {dayPosts.map((p) => (
                    <span
                      key={p.id}
                      className={cn('inline-block w-2 h-2 rounded-full', STATUS_DOT[p.status])}
                      title={`${STATUS_LABEL[p.status]}: ${p.content.slice(0, 60)}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Day detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) { setShowCreateForm(false); setConfirmDeleteId(null); cancelEdit() }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Existing posts for this day */}
          {!showCreateForm && (
            <div className="space-y-3">
              {selectedDayPosts.length > 0 ? (
                <div className="space-y-2">
                  {selectedDayPosts.map((p) => (
                    <div key={p.id} className="rounded-lg border p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(p.scheduledFor), 'h:mm a')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={cn('inline-block w-2 h-2 rounded-full', STATUS_DOT[p.status])} />
                          <span className="text-xs text-muted-foreground">{STATUS_LABEL[p.status]}</span>
                        </div>
                      </div>

                      {editingPostId === p.id ? (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                              className="text-sm"
                            />
                            <p className={cn(
                              'text-xs text-right tabular-nums',
                              editContent.length > 2200 ? 'text-destructive font-medium' : 'text-muted-foreground',
                            )}>
                              {editContent.length} / 2200
                            </p>
                          </div>
                          <Input
                            type="time"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="w-32 h-8 text-sm"
                          />
                          {editError && (
                            <p className="text-xs text-destructive">{editError}</p>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveEdit(p)} disabled={editLoading || editContent.length > 2200}>
                              {editLoading ? 'Saving…' : 'Save'}
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelEdit} disabled={editLoading}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm line-clamp-2">{p.content}</p>
                          {p.platforms.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {p.platforms.map((pl) => (
                                <span key={pl} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                  {pl}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Performance metrics for published posts */}
                          {p.status === 'PUBLISHED' && p.metrics && p.metrics.length > 0 && (
                            <div className="rounded-md bg-muted/50 border px-3 py-2 space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Performance</p>
                              {p.metrics.map((m) => {
                                const total = m.likes + m.comments + m.shares
                                return (
                                  <div key={m.platform}>
                                    {p.metrics.length > 1 && (
                                      <p className="text-[10px] text-muted-foreground mb-1">{m.platform}</p>
                                    )}
                                    <div className="grid grid-cols-4 gap-2">
                                      {[
                                        { label: 'Likes',       value: m.likes },
                                        { label: 'Comments',    value: m.comments },
                                        { label: 'Shares',      value: m.shares },
                                        { label: 'Reach',       value: m.reach },
                                      ].map(({ label, value }) => (
                                        <div key={label} className="text-center">
                                          <p className="text-sm font-semibold tabular-nums">
                                            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground">{label}</p>
                                        </div>
                                      ))}
                                    </div>
                                    {total === 0 && (
                                      <p className="text-[10px] text-muted-foreground mt-1">Metrics syncing…</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Evergreen recycling */}
                          {p.status === 'PUBLISHED' && (
                            <div className="flex items-center gap-2 pt-1 border-t mt-2">
                              {p.evergreen ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">♻ Evergreen · every {p.evergreenInterval}d</span>
                                  <button onClick={() => handleSetEvergreen(p.id, false, 30)} className="text-[10px] text-muted-foreground hover:text-foreground">Remove</button>
                                </div>
                              ) : evergreenPostId === p.id ? (
                                <div className="flex items-center gap-1.5">
                                  <Input type="number" min={7} max={365} value={evergreenDays} onChange={(e) => setEvergreenDays(e.target.value)} className="w-16 h-6 text-xs" />
                                  <span className="text-[10px] text-muted-foreground">days</span>
                                  <Button size="sm" className="h-6 text-[10px]" onClick={() => handleSetEvergreen(p.id, true, parseInt(evergreenDays))} disabled={evergreenLoading}>Set</Button>
                                  <button onClick={() => setEvergreenPostId(null)} className="text-[10px] text-muted-foreground">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => setEvergreenPostId(p.id)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                                  <span>♻</span> Set as evergreen
                                </button>
                              )}
                            </div>
                          )}

                          {/* Rejection note */}
                          {p.status === 'DRAFT' && p.reviewNote && (
                            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive space-y-0.5">
                              <p className="font-medium">Returned with feedback:</p>
                              <p>{p.reviewNote}</p>
                            </div>
                          )}

                          {/* Actions */}
                          {(p.status === 'SCHEDULED' || p.status === 'DRAFT') && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {p.status === 'SCHEDULED' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => { startEdit(p); setConfirmDeleteId(null) }}
                                >
                                  Edit
                                </Button>
                              )}
                              {p.status === 'DRAFT' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => handleSubmitReview(p.id)}
                                  disabled={submittingReviewId === p.id}
                                >
                                  {submittingReviewId === p.id ? 'Submitting…' : 'Submit for Review'}
                                </Button>
                              )}
                              {confirmDeleteId === p.id ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                    onClick={() => { setConfirmDeleteId(null); handleDelete(p.id) }}
                                    disabled={deletingPostId === p.id}
                                  >
                                    {deletingPostId === p.id ? 'Deleting…' : 'Confirm delete'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirmDeleteId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  onClick={() => setConfirmDeleteId(p.id)}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No posts scheduled for this day.
                </p>
              )}

              {selectedDayIsPast ? (
                <p className="text-xs text-center text-muted-foreground py-1">
                  Past days are read-only — you can&apos;t schedule new posts here.
                </p>
              ) : (
                <Button className="w-full" onClick={() => setShowCreateForm(true)}>
                  + Schedule a Post
                </Button>
              )}
            </div>
          )}

          {/* Create form */}
          {showCreateForm && selectedDate && !selectedDayIsPast && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="w-fit -mt-1 mb-1 text-muted-foreground"
                onClick={() => setShowCreateForm(false)}
              >
                ← Back
              </Button>
              <CreatePostForm
                key={formKey}
                selectedDate={selectedDate}
                workspaceId={workspaceId}
                token={token}
                onSuccess={handlePostSuccess}
                onClose={() => setDialogOpen(false)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Success toast */}
      <Toast open={toastOpen} onOpenChange={setToastOpen} duration={4000}>
        <div className="grid gap-1">
          <ToastTitle>Success</ToastTitle>
          <ToastDescription>{toastMessage}</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </div>
  )
}
