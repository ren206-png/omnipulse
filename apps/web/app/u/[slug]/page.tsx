import { notFound } from 'next/navigation'

interface BioLink {
  id: string
  title: string
  url: string
  icon: string | null
  clicks: number
  active: boolean
  position: number
}

interface BioPageData {
  id: string
  slug: string
  title: string
  bio: string | null
  avatarUrl: string | null
  theme: string
  views: number
  links: BioLink[]
}

export const THEMES: Record<string, { bg: string; card: string; text: string; subtext: string; button: string; buttonText: string }> = {
  light: {
    bg: 'bg-gradient-to-br from-gray-100 to-gray-200',
    card: 'bg-white',
    text: 'text-gray-900',
    subtext: 'text-gray-500',
    button: 'bg-gray-900 hover:bg-gray-700',
    buttonText: 'text-white',
  },
  dark: {
    bg: 'bg-gradient-to-br from-slate-900 to-slate-800',
    card: 'bg-slate-800',
    text: 'text-white',
    subtext: 'text-slate-400',
    button: 'bg-white hover:bg-gray-100',
    buttonText: 'text-gray-900',
  },
  gradient: {
    bg: 'bg-gradient-to-br from-purple-600 to-blue-500',
    card: 'bg-white/10 backdrop-blur-sm',
    text: 'text-white',
    subtext: 'text-white/70',
    button: 'bg-white/20 hover:bg-white/30 border border-white/30',
    buttonText: 'text-white',
  },
}

function LinkButton({ link, slug, theme }: { link: BioLink; slug: string; theme: typeof THEMES[string] }) {
  const handleClick = `
    (async function() {
      try { await fetch('/api/v1/bio/public/${slug}/click/${link.id}', { method: 'POST' }) } catch {}
      window.open(${JSON.stringify(link.url)}, '_blank', 'noopener,noreferrer')
    })()
  `
  return (
    <button
      onClick={undefined}
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - onclick is a string for SSR-safe inline handler
      onclick={handleClick}
      className={`w-full py-3 px-4 rounded-full font-medium text-sm transition-all duration-200 shadow-sm ${theme.button} ${theme.buttonText}`}
    >
      {link.icon && <span className="mr-2">{link.icon}</span>}
      {link.title}
    </button>
  )
}

export default async function BioPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const res = await fetch(`${apiUrl}/api/v1/bio/public/${slug}`, { cache: 'no-store' })
  if (!res.ok) notFound()
  const { page } = await res.json() as { page: BioPageData }

  const theme = THEMES[page.theme] ?? THEMES.light

  return (
    <div className={`min-h-screen ${theme.bg} flex flex-col items-center justify-center px-4 py-12`}>
      <div className={`w-full max-w-sm mx-auto ${theme.card} rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-5`}>
        {/* Avatar */}
        <div className="relative">
          {page.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatarUrl}
              alt={page.title}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-white/20"
            />
          ) : (
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${theme.button} ${theme.buttonText}`}>
              {page.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Title & Bio */}
        <div className="text-center">
          <h1 className={`text-2xl font-bold ${theme.text}`}>{page.title}</h1>
          {page.bio && (
            <p className={`mt-1.5 text-sm leading-relaxed ${theme.subtext}`}>{page.bio}</p>
          )}
        </div>

        {/* Links */}
        <div className="w-full flex flex-col gap-3 mt-2">
          {page.links.map((link) => (
            <LinkButton key={link.id} link={link} slug={slug} theme={theme} />
          ))}
          {page.links.length === 0 && (
            <p className={`text-center text-sm ${theme.subtext}`}>No links yet.</p>
          )}
        </div>
      </div>

      {/* Watermark */}
      <p className="mt-6 text-xs text-white/40 text-center">
        Powered by OmniPulse
      </p>
    </div>
  )
}
