import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OmniPulse — Social Media Management',
  description: 'Schedule posts, track analytics, and grow your brand across every platform.',
  metadataBase: new URL('https://getomnipulse.com'),
  keywords: [
    'social media management',
    'schedule posts',
    'social media analytics',
    'content calendar',
    'instagram scheduler',
    'twitter scheduler',
    'linkedin scheduler',
    'social media tool',
  ],
  openGraph: {
    title: 'OmniPulse — Social Media Management',
    description: 'Schedule posts, track analytics, and grow your brand across every platform.',
    url: 'https://getomnipulse.com',
    siteName: 'OmniPulse',
    type: 'website',
    images: [
      {
        url: 'https://getomnipulse.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OmniPulse — Social Media Management',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OmniPulse — Social Media Management',
    description: 'Schedule posts, track analytics, and grow your brand across every platform.',
    images: ['https://getomnipulse.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: 'https://getomnipulse.com',
  },
  verification: {
    google: 'add-your-google-site-verification-here',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var saved = localStorage.getItem('theme');
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (saved === 'dark' || (!saved && prefersDark)) {
              document.documentElement.classList.add('dark');
            }
          })();
        ` }} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="OmniPulse" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">{children}</body>
    </html>
  )
}
