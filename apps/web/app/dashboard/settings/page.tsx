import { cookies } from 'next/headers'
import Link from 'next/link'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value ?? ''
  const { workspace } = await searchParams

  const items = [
    {
      href: workspace ? `/dashboard/settings/team?workspaceId=${workspace}` : '/dashboard/settings/team',
      title: 'Team & Members',
      description: 'Invite team members, manage roles, and view pending invitations.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      href: workspace ? `/dashboard/accounts?workspace=${workspace}` : '/dashboard/accounts',
      title: 'Social Accounts',
      description: 'Connect and manage your social media accounts.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      ),
    },
    {
      href: workspace ? `/dashboard/billing?workspace=${workspace}` : '/dashboard/billing',
      title: 'Billing & Plan',
      description: 'View your current plan, upgrade, or manage your subscription.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
    },
    {
      href: '/dashboard/settings/security',
      title: 'Security',
      description: 'Enable two-factor authentication (2FA) to add an extra layer of protection to your account.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
    {
      href: workspace ? `/dashboard/settings/digest?workspaceId=${workspace}` : '/dashboard/settings/digest',
      title: 'Weekly Email Digest',
      description: 'Get a weekly performance summary every Monday morning. Send a test digest anytime.',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.77 18a19.45 19.45 0 0 1-6-6 19.79 19.79 0 0 1-3-8.18A2 2 0 0 1 4.72 2H7a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      ),
    },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your workspace configuration.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors group"
          >
            <div className="mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            </div>
            <svg className="mt-1 text-muted-foreground group-hover:text-foreground transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
