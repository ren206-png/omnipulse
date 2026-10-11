import * as Sentry from '@sentry/nextjs'
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  scrubBreadcrumb,
  scrubUrl,
} from '@/lib/sentry'

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1,
  dataCollection: SENTRY_DATA_COLLECTION,
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  beforeSend: (event) => {
    if (event.request?.url) event.request.url = scrubUrl(event.request.url)
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
