import './config/env.js'
import 'dotenv/config'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { logger } from './lib/logger.js'
import { env } from './config/env.js'

// Init Sentry before anything else (no-ops if SENTRY_DSN is not set)
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
  })
  logger.info('Sentry initialized')
}
import authRouter from './routes/auth.js'
import workspacesRouter from './routes/workspaces.js'
import postsRouter from './routes/posts.js'
import analyticsRouter from './routes/analytics.js'
import socialAccountsRouter from './routes/socialAccounts.js'
import aiRouter from './routes/ai.js'
import teamRouter from './routes/team.js'
import billingRouter from './routes/billing.js'
import templatesRouter from './routes/templates.js'
import notificationsRouter from './routes/notifications.js'
import reportsRouter from './routes/reports.js'
import mediaRouter from './routes/media.js'
import queueRouter from './routes/queue.js'
import inboxRouter from './routes/inbox.js'
import bioRouter from './routes/bio.js'
import webhooksRouter from './routes/webhooks.js'
import activityRouter from './routes/activity.js'
import apiKeysRouter from './routes/apikeys.js'
import rssRouter from './routes/rss.js'
import brandingRouter from './routes/branding.js'
import clientPortalRouter from './routes/clientPortal.js'
import digestRouter from './routes/digest.js'
import competitorsRouter from './routes/competitors.js'
import adminRouter from './routes/admin.js'
import onboardingRouter from './routes/onboarding.js'
import queueSlotsRouter from './routes/queueSlots.js'
import { startEvergreenWorker } from './workers/evergreen.worker.js'
import { syncAnalytics } from './workers/analyticsSync.worker.js'
import { sendWeeklyDigest } from './lib/digest.js'

// Run DB migrations on startup (safe to run repeatedly)
async function runMigrations() {
  const { execSync } = await import('child_process')
  try {
    execSync('./node_modules/.bin/prisma migrate deploy', { stdio: 'inherit' })
  } catch (e) {
    console.error('Migration failed:', e)
    process.exit(1)
  }
}
await runMigrations()

const app = express()

app.use(cors({
  origin: env.CORS_ORIGINS,
  credentials: true,
}))
// Raw body for Stripe webhooks — must be registered before express.json()
app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }))

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/workspaces', workspacesRouter)
app.use('/api/v1/posts', postsRouter)
app.use('/api/v1/analytics', analyticsRouter)
app.use('/api/v1/social-accounts', socialAccountsRouter)
app.use('/api/v1/ai', aiRouter)
app.use('/api/v1/team', teamRouter)
app.use('/api/v1/billing', billingRouter)
app.use('/api/v1/templates', templatesRouter)
app.use('/api/v1/notifications', notificationsRouter)
app.use('/api/v1/reports', reportsRouter)
app.use('/api/v1/media', mediaRouter)
app.use('/api/v1/queue', queueRouter)
app.use('/api/v1/inbox', inboxRouter)
app.use('/api/v1/bio', bioRouter)
app.use('/api/v1/webhooks', webhooksRouter)
app.use('/api/v1/activity', activityRouter)
app.use('/api/v1/api-keys', apiKeysRouter)
app.use('/api/v1/rss', rssRouter)
app.use('/api/v1/branding', brandingRouter)
app.use('/api/v1/client-portal', clientPortalRouter)
app.use('/api/v1/digest', digestRouter)
app.use('/api/v1/competitors', competitorsRouter)
app.use('/api/v1/admin', adminRouter)
app.use('/api/v1/onboarding', onboardingRouter)
app.use('/api/v1/queue-slots', queueSlotsRouter)
app.use('/uploads', express.static('public/uploads'))

// Sentry error handler — must be after all routes
if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app)
}

// Global unhandled error fallback
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error')
  if (!res.headersSent) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' })
  }
})

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `OmniPulse API listening on port ${env.PORT}`)
})
startEvergreenWorker()
// Sync analytics every 6 hours
setInterval(() => { syncAnalytics().catch(() => {}) }, 6 * 60 * 60 * 1000)
// Weekly digest — every Monday 9am UTC
const now = new Date()
const nextMonday = new Date(now)
nextMonday.setUTCDate(now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7 || 7))
nextMonday.setUTCHours(9, 0, 0, 0)
const msUntilMonday = nextMonday.getTime() - now.getTime()
setTimeout(() => {
  sendWeeklyDigest().catch(() => {})
  setInterval(() => sendWeeklyDigest().catch(() => {}), 7 * 24 * 60 * 60 * 1000)
}, msUntilMonday)
