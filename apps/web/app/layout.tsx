import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OmniPulse — Social Media Management',
  description: 'Schedule posts, track analytics, and grow your brand across every platform.',
  metadataBase: new URL('https://getomnipulse.com'),
  openGraph: {
    title: 'OmniPulse — Social Media Management',
    description: 'Schedule posts, track analytics, and grow your brand across every platform.',
    url: 'https://getomnipulse.com',
    siteName: 'OmniPulse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OmniPulse — Social Media Management',
    description: 'Schedule posts, track analytics, and grow your brand across every platform.',
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
      </head>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">{children}</body>
    </html>
  )
}
