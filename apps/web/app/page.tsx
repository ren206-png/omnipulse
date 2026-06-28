import Link from 'next/link'

const FEATURES = [
  {
    icon: '📅',
    title: 'Smart Scheduling',
    description: 'Schedule posts to all platforms from one calendar',
  },
  {
    icon: '📊',
    title: 'Analytics',
    description: 'Track followers, reach, and engagement in real-time',
  },
  {
    icon: '🤖',
    title: 'AI Captions',
    description: 'Generate on-brand captions with one click',
  },
  {
    icon: '💬',
    title: 'Social Inbox',
    description: 'Manage all comments, DMs, and mentions in one place',
  },
  {
    icon: '👥',
    title: 'Team Collaboration',
    description: 'Invite team members, assign roles, approve posts',
  },
  {
    icon: '🔗',
    title: 'Link in Bio',
    description: 'Create a beautiful bio page with click tracking',
  },
]

const PRICING = [
  {
    name: 'FREE',
    price: '$0',
    period: '/mo',
    features: ['1 workspace', '3 accounts', '10 posts/month'],
    highlighted: false,
    badge: null,
  },
  {
    name: 'PRO',
    price: '$29',
    period: '/mo',
    features: [
      '5 workspaces',
      '10 accounts',
      '200 posts/month',
      'AI features',
      'Analytics',
    ],
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'AGENCY',
    price: '$99',
    period: '/mo',
    features: [
      'Unlimited workspaces',
      '50 accounts',
      'Unlimited posts',
      'White-label',
      'Priority support',
    ],
    highlighted: false,
    badge: null,
  },
]

const PLATFORMS = [
  { name: 'Instagram', icon: '📸' },
  { name: 'Facebook', icon: '👥' },
  { name: 'TikTok', icon: '🎵' },
  { name: 'X', icon: '𝕏' },
  { name: 'YouTube', icon: '▶️' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Nav */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              OmniPulse
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-400">
            <a href="#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white py-24 sm:py-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6">
            Manage all your social media{' '}
            <span className="text-indigo-200">in one place</span>
          </h1>
          <p className="text-lg sm:text-xl text-indigo-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Schedule posts, track analytics, engage your audience — across every platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold bg-white text-indigo-700 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg shadow-black/20"
            >
              Start for Free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold border-2 border-white/40 text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              View Demo
            </Link>
          </div>

          {/* Platform icons */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {PLATFORMS.map((p) => (
              <div key={p.name} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl">
                  {p.icon}
                </div>
                <span className="text-xs text-indigo-200 font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything you need to grow</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Powerful tools designed to save you time and amplify your reach across every social platform.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-700"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 bg-white dark:bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              Start free, scale as you grow. No hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 flex flex-col relative ${
                  plan.highlighted
                    ? 'border-2 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-900/20'
                    : 'border border-gray-200 dark:border-gray-800'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                      {plan.badge}
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <span className="text-indigo-500 mt-0.5 shrink-0">✓</span>
                      <span className="text-gray-700 dark:text-gray-300">{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`text-center text-sm font-semibold py-3 px-6 rounded-xl transition-colors ${
                    plan.highlighted
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <div className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-1">
                OmniPulse
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your all-in-one social media command center.
              </p>
            </div>
            <nav className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-gray-900 dark:hover:text-white transition-colors">Contact</Link>
            </nav>
          </div>
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-600">
            &copy; {new Date().getFullYear()} OmniPulse. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
