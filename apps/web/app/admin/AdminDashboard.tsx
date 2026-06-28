'use client'

import { useState, useCallback, useEffect } from 'react'
import { format } from 'date-fns'

interface Workspace {
  id: string
  name: string
  plan: string
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  _count: { posts: number; socialAccounts: number }
}

interface User {
  id: string
  email: string
  createdAt: string
  workspaces: Workspace[]
  _count: { workspaces: number }
}

interface Stats {
  totals: { users: number; workspaces: number; posts: number; published: number }
  activeWorkspacesLast7Days: number
  plans: Record<string, number>
  recentUsers: User[]
}

const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  PRO: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  AGENCY: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export function AdminDashboard({ token, initialStats, apiUrl }: { token: string; initialStats: Stats; apiUrl: string }) {
  const [stats] = useState<Stats>(initialStats)
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview')

  const fetchUsers = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (q.trim()) params.set('search', q.trim())
      const res = await fetch(`${apiUrl}/api/v1/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { users: User[]; total: number; pages: number }
      setUsers(data.users)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [apiUrl, token])

  useEffect(() => {
    if (activeTab === 'users') fetchUsers(page, search)
  }, [activeTab, page, search, fetchUsers])

  // Debounce search
  useEffect(() => {
    if (activeTab !== 'users') return
    const t = setTimeout(() => { setPage(1); fetchUsers(1, search) }, 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const paying = (stats.plans['PRO'] ?? 0) + (stats.plans['AGENCY'] ?? 0)
  const publishRate = stats.totals.posts > 0
    ? Math.round((stats.totals.published / stats.totals.posts) * 100)
    : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">OmniPulse</span>
            <span className="text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
              Admin
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Developer view · not visible to users</p>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 pb-0">
          {(['overview', 'users'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Overview tab ── */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={stats.totals.users} />
              <StatCard label="Workspaces" value={stats.totals.workspaces} />
              <StatCard label="Paying Customers" value={paying} sub={`${stats.totals.users > 0 ? Math.round((paying / stats.totals.users) * 100) : 0}% conversion`} />
              <StatCard label="Active (7d)" value={stats.activeWorkspacesLast7Days} sub="workspaces published" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard label="Posts Created" value={stats.totals.posts} />
              <StatCard label="Posts Published" value={stats.totals.published} sub={`${publishRate}% publish rate`} />
              <StatCard label="Free Workspaces" value={stats.plans['FREE'] ?? 0} sub={`${stats.totals.workspaces > 0 ? Math.round(((stats.plans['FREE'] ?? 0) / stats.totals.workspaces) * 100) : 0}% of total`} />
            </div>

            {/* Plan breakdown */}
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-base">Plan Breakdown</h2>
              <div className="space-y-3">
                {['FREE', 'PRO', 'AGENCY'].map((plan) => {
                  const count = stats.plans[plan] ?? 0
                  const pct = stats.totals.workspaces > 0 ? (count / stats.totals.workspaces) * 100 : 0
                  return (
                    <div key={plan} className="flex items-center gap-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-16 text-center ${PLAN_COLORS[plan]}`}>
                        {plan}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold tabular-nums w-8 text-right">{count}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent signups */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-base">Recent Signups</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Last 20 users to join</p>
              </div>
              <div className="divide-y">
                {stats.recentUsers.map((user) => (
                  <div key={user.id} className="px-5 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {user.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {user._count.workspaces} workspace{user._count.workspaces !== 1 ? 's' : ''}
                        {user.workspaces[0] && (
                          <span className="ml-2">
                            · <span className={`font-medium ${user.workspaces[0].plan === 'FREE' ? 'text-muted-foreground' : 'text-primary'}`}>
                              {user.workspaces[0].plan}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      {format(new Date(user.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search by email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-sm text-muted-foreground">{total.toLocaleString()} users</p>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Joined</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Workspaces</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Posts</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Accounts</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Sub Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + (j * 13) % 40}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  ) : users.map((user) => {
                    const ws = user.workspaces[0]
                    const totalPosts = user.workspaces.reduce((s, w) => s + w._count.posts, 0)
                    const totalAccounts = user.workspaces.reduce((s, w) => s + w._count.socialAccounts, 0)
                    return (
                      <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[220px] truncate">{user.email}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {format(new Date(user.createdAt), 'MMM d, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user._count.workspaces}</td>
                        <td className="px-4 py-3">
                          {ws ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_COLORS[ws.plan] ?? ''}`}>
                              {ws.plan}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{totalPosts}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{totalAccounts}</td>
                        <td className="px-4 py-3">
                          {ws?.subscriptionStatus ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              ws.subscriptionStatus === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {ws.subscriptionStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
