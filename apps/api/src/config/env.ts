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
}
