import Link from 'next/link'

const SETTINGS_SECTIONS = [
  {
    href: '/dashboard/settings/notifications',
    icon: '🔔',
    title: 'Notifications',
    desc: 'Control what alerts you receive',
  },
  {
    href: '/dashboard/settings/security',
    icon: '🔐',
    title: 'Security',
    desc: 'Password, 2FA, sessions',
  },
  {
    href: '/dashboard/settings/team',
    icon: '👥',
    title: 'Team',
    desc: 'Invite members, manage roles',
  },
  {
    href: '/dashboard/settings/api-keys',
    icon: '🔑',
    title: 'API Keys',
    desc: 'Access OmniPulse via API',
  },
  {
    href: '/dashboard/settings/webhooks',
    icon: '🪝',
    title: 'Webhooks',
    desc: 'Push events to your endpoints',
  },
  {
    href: '/dashboard/settings/rss',
    icon: '📡',
    title: 'RSS Feeds',
    desc: 'Auto-post from RSS sources',
  },
  {
    href: '/dashboard/settings/digest',
    icon: '📧',
    title: 'Email Digest',
    desc: 'Weekly performance reports',
  },
  {
    href: '/dashboard/settings/branding',
    icon: '🎨',
    title: 'Branding',
    desc: 'Logo, colors, custom domain',
  },
  {
    href: '/dashboard/settings/client-portal',
    icon: '👤',
    title: 'Client Portal',
    desc: 'White-label client access',
  },
]

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your workspace configuration.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors group"
          >
            <div className="text-2xl leading-none mt-0.5">{section.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{section.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{section.desc}</p>
            </div>
            <svg
              className="mt-1 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
