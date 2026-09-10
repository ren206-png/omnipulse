import 'dotenv/config'

const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN'] as const

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Check your .env file or environment configuration.`,
    )
  }
}

if (process.env.NODE_ENV === 'production') {
  const encKey = process.env.TOKEN_ENCRYPTION_KEY ?? ''
  if (!encKey || encKey.length !== 64) {
    // Use console.error here — logger cannot be imported into env.ts (circular dependency)
    console.error(
      '[STARTUP] TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in production. ' +
        'Social account tokens will not be encrypted correctly.',
    )
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN!,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  AYRSHARE_API_KEY: process.env.AYRSHARE_API_KEY,
  AYRSHARE_X_API_KEY: process.env.AYRSHARE_X_API_KEY,
  AYRSHARE_X_API_SECRET: process.env.AYRSHARE_X_API_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID,
  STRIPE_AGENCY_PRICE_ID: process.env.STRIPE_AGENCY_PRICE_ID,
  STRIPE_STARTER_PRICE_ID: process.env.STRIPE_STARTER_PRICE_ID,
  STRIPE_AI_METERED_PRICE_ID: process.env.STRIPE_AI_METERED_PRICE_ID,
  STRIPE_AI_METER_EVENT_NAME: process.env.STRIPE_AI_METER_EVENT_NAME ?? '',
  APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
  API_URL: process.env.API_URL ?? process.env.APP_URL ?? 'http://localhost:4000',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  SENTRY_DSN: process.env.SENTRY_DSN ?? '',
  // LinkedIn OAuth
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID ?? '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET ?? '',
  LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI ?? '',
  LINKEDIN_API_VERSION: process.env.LINKEDIN_API_VERSION ?? '202506',
  // Token encryption (AES-256-GCM) — 32-byte hex key
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  // AI feature daily caps (per-user)
  AI_MULTIPLIER_DAILY_LIMIT: parseInt(process.env.AI_MULTIPLIER_DAILY_LIMIT ?? '50', 10),
  AI_VISION_DAILY_LIMIT: parseInt(process.env.AI_VISION_DAILY_LIMIT ?? '50', 10),
  // SEO Data Gateway
  SEO_DATA_PROVIDER: process.env.SEO_DATA_PROVIDER ?? 'mock',
  SEO_DATA_API_KEY: process.env.SEO_DATA_API_KEY ?? '',
  // TradeFlow Bridge
  TRADEFLOW_WEBHOOK_SECRET: process.env.TRADEFLOW_WEBHOOK_SECRET ?? '',
  // Internal service-to-service secret (for /ingest endpoint)
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET ?? '',
  // Email (Resend)
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
  // Monitoring alerts
  SLACK_ALERT_WEBHOOK_URL: process.env.SLACK_ALERT_WEBHOOK_URL ?? '',
  MONITOR_ALERT_WEBHOOK_URL: process.env.MONITOR_ALERT_WEBHOOK_URL ?? '',
  // Facebook/Instagram OAuth credentials (used for both OAuth flow and token auto-refresh)
  FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID ?? process.env.FACEBOOK_APP_ID ?? '',
  FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET ?? process.env.FACEBOOK_APP_SECRET ?? '',
  // Legacy aliases — some Railway envs may have APP_ID set instead of CLIENT_ID
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID ?? process.env.FACEBOOK_CLIENT_ID ?? '',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ?? process.env.FACEBOOK_CLIENT_SECRET ?? '',
  // Google / YouTube OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  // X (Twitter) OAuth
  X_CLIENT_ID: process.env.X_CLIENT_ID ?? '',
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET ?? '',
  // TikTok OAuth
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY ?? '',
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET ?? '',
  // Feature flags
  FF_AGENCY_APPROVALS: process.env.FF_AGENCY_APPROVALS === 'true',
  FF_EVERGREEN_QUEUE: process.env.FF_EVERGREEN_QUEUE === 'true',
  FF_OUTCOME_ANALYTICS: process.env.FF_OUTCOME_ANALYTICS === 'true',
  FF_PHOTO_TO_POST: process.env.FF_PHOTO_TO_POST === 'true',
  FF_PUBLISH_RELIABILITY: process.env.FF_PUBLISH_RELIABILITY === 'true',
  FF_TRADEFLOW_BRIDGE: process.env.FF_TRADEFLOW_BRIDGE === 'true',
  // Automation
  AUTOMATION_ENGINE_ENABLED: process.env.AUTOMATION_ENGINE_ENABLED === 'true',
  AUTOMATION_WEBHOOK_SECRET: process.env.AUTOMATION_WEBHOOK_SECRET ?? '',
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  // Frontend URL (for email links etc.)
  WEB_URL: process.env.WEB_URL ?? process.env.APP_URL ?? 'http://localhost:3000',
}
