import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Note: 'standalone' output is incompatible with Vercel — Vercel manages its own serverless output
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Prevent dashboard from being indexed via HTTP header too
        source: '/dashboard/(.*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

// No SENTRY_AUTH_TOKEN is configured, so source-map upload is disabled (errors still report, with
// minified stack traces). Add a token + org/project later to get readable production stack traces.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
})
