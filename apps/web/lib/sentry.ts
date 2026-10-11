/**
 * Shared Sentry settings for the browser, Node and edge runtimes.
 *
 * The DSN is a write-only ingest key designed to be public (it ships to every browser), so a
 * fallback is committed to keep error reporting on without extra Vercel config. Override it with
 * NEXT_PUBLIC_SENTRY_DSN to point at a different project.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  'https://6daf3f3e36fdc543f4af1b2a9751da8d@o4512234716397568.ingest.us.sentry.io/4512234746740736'

/** Report only from real deployments; local dev stays quiet. */
export const SENTRY_ENABLED = process.env.NODE_ENV === 'production'

export const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV

/** Remove credentials that can appear in URLs (e.g. the OAuth connect link carries ?token=<JWT>). */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url
  return url.replace(/([?&](?:token|access_token|code|state)=)[^&#]*/gi, '$1[redacted]')
}

type Crumb = { data?: Record<string, unknown>; message?: string }

export function scrubBreadcrumb<T extends Crumb>(crumb: T): T {
  if (crumb.data) {
    for (const key of ['url', 'from', 'to']) {
      const v = crumb.data[key]
      if (typeof v === 'string') crumb.data[key] = scrubUrl(v)
    }
  }
  if (typeof crumb.message === 'string') crumb.message = scrubUrl(crumb.message)
  return crumb
}

/**
 * Privacy-first data collection (Sentry SDK v11). OmniPulse handles login tokens, OAuth callbacks and
 * users' unpublished post content, so collect none of the optional request data. Stack traces,
 * error messages and the route still report.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  stackFrameVariables: false,
  databaseQueryData: false,
}
