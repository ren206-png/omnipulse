'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const COLOR_SWATCHES = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
]

interface Campaign {
  id: string
  name: string
  color: string
  postCount?: number
  createdAt: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function CampaignsClient({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id ?? ''

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createColor, setCreateColor] = useState(COLOR_SWATCHES[0])
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(COLOR_SWATCHES[0])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/v1/campaigns?workspaceId=${workspaceId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error('Failed to load campaigns')
      const data = (await res.json()) as { campaigns: Campaign[] }
      setCampaigns(data.campaigns ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  async function handleCreate() {
    const name = createName.trim()
    if (!name) { setCreateError('Name is required'); return }
    setCreateLoading(true)
    setCreateError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ workspaceId, name, color: createColor }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setCreateError(body.error ?? 'Failed to create campaign')
        return
      }
      setCreateName('')
      setCreateColor(COLOR_SWATCHES[0])
      setShowCreate(false)
      await fetchCampaigns()
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreateLoading(false)
    }
  }

  function startEdit(c: Campaign) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditColor(c.color)
    setEditError(null)
    setDeleteConfirmId(null)
  }

  async function handleEdit(id: string) {
    const name = editName.trim()
    if (!name) { setEditError('Name is required'); return }
    setEditLoading(true)
    setEditError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, color: editColor }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setEditError(body.error ?? 'Failed to update campaign')
        return
      }
      setEditingId(null)
      await fetchCampaigns()
    } catch {
      setEditError('Network error — please try again')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    try {
      await fetch(`${API_URL}/api/v1/campaigns/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setDeleteConfirmId(null)
      await fetchCampaigns()
    } catch {
      // silently ignore
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campaigns 🏷️</h1>
        <Button
          onClick={() => {
            setShowCreate((v) => !v)
            setCreateError(null)
          }}
          variant={showCreate ? 'outline' : 'default'}
        >
          {showCreate ? 'Cancel' : 'New Campaign'}
        </Button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="rounded-xl border p-5 space-y-4 bg-card">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            New Campaign
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Campaign name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setShowCreate(false)
              }}
              className="flex-1"
              autoFocus
            />
            <div className="flex items-center gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCreateColor(c)}
                  style={{ backgroundColor: c }}
                  className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
                  aria-label={`Color ${c}`}
                >
                  {createColor === c && (
                    <span className="flex items-center justify-center w-full h-full text-white text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>
      )}

      {/* Loading / error */}
      {loading && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Empty state */}
      {!loading && !error && campaigns.length === 0 && (
        <div className="rounded-xl border p-10 text-center">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="text-muted-foreground max-w-sm mx-auto">
            No campaigns yet — create one to organize your posts by topic, client, or promotion.
          </p>
        </div>
      )}

      {/* Campaign cards grid */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-xl border p-5 relative group bg-card"
              style={{ borderLeftWidth: 4, borderLeftColor: campaign.color }}
            >
              {editingId === campaign.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEdit(campaign.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        style={{ backgroundColor: c }}
                        className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
                        aria-label={`Color ${c}`}
                      >
                        {editColor === c && (
                          <span className="flex items-center justify-center w-full h-full text-white text-xs font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {editError && <p className="text-sm text-destructive">{editError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleEdit(campaign.id)} disabled={editLoading}>
                      {editLoading ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={editLoading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : deleteConfirmId === campaign.id ? (
                /* Delete confirm */
                <div className="space-y-3">
                  <p className="text-sm font-medium">Delete &ldquo;{campaign.name}&rdquo;?</p>
                  <p className="text-xs text-muted-foreground">This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(campaign.id)}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? 'Deleting…' : 'Delete'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleteLoading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Normal view */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/calendar?campaignId=${campaign.id}`}
                      className="font-semibold text-base hover:underline leading-tight flex-1"
                    >
                      {campaign.name}
                    </Link>
                    {/* Hover action buttons */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(campaign)}
                        className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                        aria-label="Edit campaign"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => { setDeleteConfirmId(campaign.id); setEditingId(null) }}
                        className="text-xs text-muted-foreground hover:text-destructive px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                        aria-label="Delete campaign"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    {campaign.postCount !== undefined && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                        {campaign.postCount} {campaign.postCount === 1 ? 'post' : 'posts'}
                      </span>
                    )}
                    <span>{formatDate(campaign.createdAt)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
