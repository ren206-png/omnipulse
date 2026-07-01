'use client'

import { useEffect, useState, useCallback } from 'react'
import { use } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X (Twitter)',
  GOOGLE: 'Google',
  LINKEDIN: 'LinkedIn',
}

interface PostApproval {
  id: string
  postId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  comment: string | null
  reviewedAt: string | null
}

interface Post {
  id: string
  content: string
  platforms: string[]
  scheduledFor: string | null
  status: string
  existingApproval: PostApproval | null
}

interface PortalData {
  clientName: string | null
  workspaceName: string
  posts: Post[]
}

function PostCard({
  post,
  token,
  onUpdate,
}: {
  post: Post
  token: string
  onUpdate: (postId: string, approval: PostApproval) => void
}) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [localApproval, setLocalApproval] = useState<PostApproval | null>(post.existingApproval)
  const [error, setError] = useState<string | null>(null)

  async function act(action: 'approve' | 'reject') {
    setLoading(action)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/portal-api/portal/${token}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, comment: comment.trim() || undefined }),
      })
      if (!res.ok) { setError('Something went wrong. Please try again.'); return }
      const approval: PostApproval = {
        id: '',
        postId: post.id,
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        comment: comment.trim() || null,
        reviewedAt: new Date().toISOString(),
      }
      setLocalApproval(approval)
      setComment('')
      onUpdate(post.id, approval)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const approval = localApproval

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <div className="p-5 space-y-3">
        {/* Platforms + date */}
        <div className="flex flex-wrap items-center gap-2">
          {post.platforms.map((p) => (
            <span key={p} className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
              {PLATFORM_LABELS[p] ?? p}
            </span>
          ))}
          {post.scheduledFor && (
            <span className="ml-auto text-xs text-gray-400">
              Scheduled {new Date(post.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Content preview */}
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
          {post.content}
          {post.content.length >= 200 && <span className="text-gray-400">…</span>}
        </p>

        {/* Approval status */}
        {approval ? (
          <div className="pt-2">
            {approval.status === 'APPROVED' && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                <span className="text-green-600 text-lg">✅</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">Approved</p>
                  {approval.comment && <p className="text-xs text-green-700 mt-0.5">"{approval.comment}"</p>}
                  {approval.reviewedAt && (
                    <p className="text-xs text-green-600 mt-0.5">
                      {new Date(approval.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )}
            {approval.status === 'REJECTED' && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <span className="text-red-600 text-lg">❌</span>
                <div>
                  <p className="text-sm font-semibold text-red-800">Changes Requested</p>
                  {approval.comment && <p className="text-xs text-red-700 mt-0.5">"{approval.comment}"</p>}
                  {approval.reviewedAt && (
                    <p className="text-xs text-red-600 mt-0.5">
                      {new Date(approval.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-2 space-y-3 border-t">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)…"
              rows={2}
              className="w-full rounded-xl border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-400"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => act('approve')}
                disabled={loading !== null}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 transition-colors"
              >
                {loading === 'approve' ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>✅ Approve</>
                )}
              </button>
              <button
                onClick={() => act('reject')}
                disabled={loading !== null}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-700 text-sm font-semibold py-2.5 transition-colors"
              >
                {loading === 'reject' ? (
                  <span className="animate-spin h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full" />
                ) : (
                  <>❌ Request Changes</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<PortalData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPortal() {
      try {
        const res = await fetch(`${API_URL}/portal-api/portal/${token}`, { cache: 'no-store' })
        if (!res.ok) { setNotFound(true); return }
        const json = await res.json()
        setData(json)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchPortal()
  }, [token])

  function handleUpdate(postId: string, approval: PostApproval) {
    if (!data) return
    setData({
      ...data,
      posts: data.posts.map((p) =>
        p.id === postId ? { ...p, existingApproval: approval } : p
      ),
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <span className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          <p className="text-sm">Loading your content review…</p>
        </div>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-800">Link not found</h1>
          <p className="text-gray-500 text-sm">This portal link is invalid or has been disabled. Please contact your agency for an updated link.</p>
        </div>
      </div>
    )
  }

  const pending = data.posts.filter((p) => !p.existingApproval || p.existingApproval.status === 'PENDING')
  const reviewed = data.posts.filter((p) => p.existingApproval && p.existingApproval.status !== 'PENDING')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — no branding, just workspace name */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 py-4">
          <h1 className="text-lg font-bold text-gray-900">{data.workspaceName}</h1>
          <p className="text-xs text-gray-500 mt-0.5">Content Review Portal</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8 space-y-8">
        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {data.clientName ? `Hi, ${data.clientName} 👋` : 'Your Content Review'}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Review the posts below and approve or request changes before they go live.
          </p>
        </div>

        {/* Pending posts */}
        {pending.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Awaiting Review ({pending.length})
            </h3>
            {pending.map((post) => (
              <PostCard key={post.id} post={post} token={token} onUpdate={handleUpdate} />
            ))}
          </section>
        )}

        {/* Reviewed posts */}
        {reviewed.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Already Reviewed ({reviewed.length})
            </h3>
            {reviewed.map((post) => (
              <PostCard key={post.id} post={post} token={token} onUpdate={handleUpdate} />
            ))}
          </section>
        )}

        {data.posts.length === 0 && (
          <div className="text-center py-20 text-gray-400 space-y-2">
            <div className="text-4xl">📭</div>
            <p className="text-base font-medium">Nothing to review right now</p>
            <p className="text-sm">Your agency hasn't scheduled any posts for review yet. Check back soon.</p>
          </div>
        )}
      </main>

      <footer className="mt-16 pb-8 text-center text-xs text-gray-400">
        This is a private, read-only content review portal.
      </footer>
    </div>
  )
}
