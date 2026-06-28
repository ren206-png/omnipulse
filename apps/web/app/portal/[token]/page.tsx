const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X (Twitter)',
  GOOGLE: 'Google',
}

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  QUEUED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

interface Snapshot {
  followers: number
  impressions: number
  engagementRate: number
  recordedAt: string
}

interface Account {
  platform: string
  externalProfileId: string
  latestSnapshot: Snapshot | null
}

interface Post {
  id: string
  content: string
  platforms: string[]
  status: string
  scheduledFor: string
  mediaUrls: string[]
}

interface PortalData {
  clientName: string | null
  workspace: {
    name: string
    plan: string
    accounts: Account[]
    recentPosts: Post[]
  }
}

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const res = await fetch(`${apiUrl}/api/v1/client-portal/view/${token}`, { cache: 'no-store' })

  if (!res.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <p className="text-gray-500 text-lg">Portal not found or has been disabled.</p>
          <p className="text-gray-400 text-sm">Contact your agency for an updated link.</p>
        </div>
      </div>
    )
  }

  const data = await res.json() as PortalData
  const { workspace, clientName } = data

  // Aggregate stats
  const totalFollowers = workspace.accounts.reduce((sum, a) => sum + (a.latestSnapshot?.followers ?? 0), 0)
  const avgEngagement = workspace.accounts.length > 0
    ? workspace.accounts.reduce((sum, a) => sum + (a.latestSnapshot?.engagementRate ?? 0), 0) / workspace.accounts.filter(a => a.latestSnapshot).length || 0
    : 0
  const totalImpressions = workspace.accounts.reduce((sum, a) => sum + (a.latestSnapshot?.impressions ?? 0), 0)

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{workspace.name}</h1>
            {clientName && <p className="text-sm text-gray-500">Client report for {clientName}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              Powered by OmniPulse
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Analytics Summary Cards */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Analytics Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-white p-5">
              <p className="text-sm text-gray-500 font-medium">Total Followers</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalFollowers.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Across {workspace.accounts.length} account{workspace.accounts.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-white p-5">
              <p className="text-sm text-gray-500 font-medium">Avg Engagement Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{avgEngagement > 0 ? `${avgEngagement.toFixed(2)}%` : '—'}</p>
              <p className="text-xs text-gray-400 mt-1">Latest snapshot</p>
            </div>
            <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-white p-5">
              <p className="text-sm text-gray-500 font-medium">Total Impressions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalImpressions.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Latest snapshot</p>
            </div>
          </div>
        </section>

        {/* Per-Platform Breakdown */}
        {workspace.accounts.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Breakdown</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {workspace.accounts.map((account) => (
                <div key={`${account.platform}-${account.externalProfileId}`} className="rounded-xl border p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{PLATFORM_LABELS[account.platform] ?? account.platform}</span>
                    <span className="text-xs text-gray-400 font-mono">{account.externalProfileId}</span>
                  </div>
                  {account.latestSnapshot ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xl font-bold text-gray-900">{account.latestSnapshot.followers.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">Followers</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-gray-900">{account.latestSnapshot.engagementRate.toFixed(2)}%</p>
                        <p className="text-xs text-gray-400">Engagement</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-gray-900">{account.latestSnapshot.impressions.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">Impressions</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No analytics data yet</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Posts */}
        {workspace.recentPosts.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Posts</h2>
            <div className="space-y-3">
              {workspace.recentPosts.map((post) => (
                <div key={post.id} className="rounded-xl border p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.platforms.map((p) => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {PLATFORM_LABELS[p] ?? p}
                      </span>
                    ))}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {post.status}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {new Date(post.scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {workspace.accounts.length === 0 && workspace.recentPosts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No data available yet.</p>
            <p className="text-sm mt-1">Check back once accounts are connected and posts are published.</p>
          </div>
        )}
      </main>

      <footer className="border-t mt-16 py-6 text-center text-xs text-gray-400">
        This is a read-only client portal &mdash; Powered by{' '}
        <a href="https://getomnipulse.com" className="hover:text-gray-600 underline underline-offset-2">OmniPulse</a>
      </footer>
    </div>
  )
}
