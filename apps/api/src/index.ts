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
import portalPublicRouter from './routes/portalPublic.js'
import digestRouter from './routes/digest.js'
import competitorsRouter from './routes/competitors.js'
import adminRouter from './routes/admin.js'
import onboardingRouter from './routes/onboarding.js'
import queueSlotsRouter from './routes/queueSlots.js'
import { twoFactorRouter } from './routes/twoFactor.js'
import campaignsRouter from './routes/campaigns.js'
import listeningRouter from './routes/listening.js'
import linksRouter from './routes/links.js'
import searchRouter from './routes/search.js'
import seoRouter from './routes/seo.js'
import seoDataRouter from './routes/seoData.js'
import dlqRouter from './routes/dlq.js'
import tradeflowRouter from './routes/tradeflow.js'
import photoToPostRouter from './routes/photoToPost.js'
import outcomeAnalyticsRouter from './routes/outcomeAnalytics.js'
import approvalsRouter from './routes/approvals.js'
import magicLinksRouter from './routes/magicLinks.js'
import agencyBrandingRouter from './routes/agencyBranding.js'
import evergreenQueueRouter from './routes/evergreenQueue.js'
import { startEvergreenWorker } from './workers/evergreen.worker.js'
import { startEvergreenRecyclerWorker } from './workers/evergreenRecycler.worker.js'
import { startStuckJobSweeperWorker } from './workers/stuckJobSweeper.worker.js'
import { syncAnalytics } from './workers/analyticsSync.worker.js'
import { startGuardianWorker } from './workers/guardian.worker.js'
import { engagementAlertWorker } from './workers/engagementAlert.worker.js'
import { startRssFeedWorker } from './workers/rssFeed.worker.js'
import { startWeeklyDigestWorker } from './workers/weeklyDigest.worker.js'
import { prisma } from './lib/prisma.js'
import IORedis from 'ioredis'

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
// Raw body for TradeFlow webhooks — before express.json()
app.use('/api/v1/tradeflow/webhook', express.raw({ type: 'application/json' }))

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  // Intentionally synchronous and bulletproof — must always return 200 for Railway healthcheck
  try {
    res.status(200).json({ status: 'ok', ts: new Date().toISOString() })
  } catch {
    res.status(200).json({ status: 'ok' })
  }
})

// Public short-link redirect — no auth required
app.get('/l/:slug', async (req, res) => {
  const { slug } = req.params
  try {
    const link = await (prisma as any).shortLink.findUnique({ where: { slug } })
    if (!link) { res.status(404).send('Link not found'); return }
    await (prisma as any).shortLink.update({ where: { slug }, data: { clicks: { increment: 1 } } })
    res.redirect(link.originalUrl)
  } catch {
    res.status(500).send('Internal error')
  }
})

// Public portal routes — no auth required (must be before requireAuth middleware)
app.use('/portal-api', portalPublicRouter)

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
app.use('/api/v1/admin/dlq', dlqRouter)
app.use('/api/v1/onboarding', onboardingRouter)
app.use('/api/v1/queue-slots', queueSlotsRouter)
app.use('/api/v1/2fa', twoFactorRouter)
app.use('/api/v1/campaigns', campaignsRouter)
app.use('/api/v1/listening', listeningRouter)
app.use('/api/v1/links', linksRouter)
app.use('/api/v1/search', searchRouter)
app.use('/api/v1/seo', seoRouter)
app.use('/api/v1/seo-data', seoDataRouter)
app.use('/api/v1/tradeflow', tradeflowRouter)
app.use('/api/v1/photo-to-post', photoToPostRouter)
app.use('/api/v1/outcome-analytics', outcomeAnalyticsRouter)
app.use('/api/v1/approvals', approvalsRouter)
app.use('/api/v1/magic-links', magicLinksRouter)
app.use('/api/v1/agency-branding', agencyBrandingRouter)
app.use('/api/v1/evergreen', evergreenQueueRouter)
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

app.listen(env.PORT, '0.0.0.0', () => {
  logger.info({ port: env.PORT }, `OmniPulse API listening on port ${env.PORT}`)
})
startEvergreenWorker()
startEvergreenRecyclerWorker()
// Guardian — self-healing system (scans every 5 min for zombie posts)
startGuardianWorker().catch((err) => logger.error({ err }, 'Failed to start guardian worker'))
// Stuck-Job Sweeper — requeues or DLQs posts stuck in PROCESSING for >15 min
startStuckJobSweeperWorker().catch((err) => logger.error({ err }, 'Failed to start stuck job sweeper worker'))
// Engagement Alert worker — notifies on standout/underperforming posts 2h after publish
void engagementAlertWorker
// Sync analytics every 6 hours
setInterval(() => { syncAnalytics().catch(() => {}) }, 6 * 60 * 60 * 1000)
// RSS Feed worker — polls active feeds on their configured interval (every 5 min check)
startRssFeedWorker()
// Weekly Digest worker — sends Monday 08:00 UTC performance emails
startWeeklyDigestWorker()

// ─── Global crash protection (single registration point) ───────────────────
// Workers previously registered these individually — consolidated here to
// prevent duplicate listeners and double process.exit calls.
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[Process] uncaughtException — exiting for restart')
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '[Process] unhandledRejection — exiting for restart')
  process.exit(1)
})
