/**
 * Alert manager — centralised incident alerting for the monitoring system.
 *
 * Supports three channels (all optional, configured via env):
 *  1. Sentry (always active when SENTRY_DSN is set)
 *  2. Slack webhook (SLACK_ALERT_WEBHOOK_URL)
 *  3. Generic webhook (MONITOR_ALERT_WEBHOOK_URL)
 *
 * De-duplicates alerts: the same alert key will not fire again within
 * DEDUP_WINDOW_MS (default 15 minutes) unless severity is 'critical'.
 */
import * as Sentry from '@sentry/node'
import { logger } from './logger.js'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Alert {
  /** Short unique key used for de-duplication, e.g. "redis.down" */
  key: string
  severity: AlertSeverity
  title: string
  message: string
  meta?: Record<string, unknown>
}

const DEDUP_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const dedupCache = new Map<string, number>()

function isDuplicate(key: string, severity: AlertSeverity): boolean {
  if (severity === 'critical') return false // always fire critical alerts
  const last = dedupCache.get(key)
  if (!last) return false
  return Date.now() - last < DEDUP_WINDOW_MS
}

function recordAlert(key: string): void {
  dedupCache.set(key, Date.now())
}

/** Send an alert through all configured channels. */
export async function sendAlert(alert: Alert): Promise<void> {
  if (isDuplicate(alert.key, alert.severity)) {
    logger.debug({ key: alert.key }, '[AlertManager] Suppressed duplicate alert')
    return
  }
  recordAlert(alert.key)

  logger.warn(
    { alert: { key: alert.key, severity: alert.severity, ...alert.meta } },
    `[AlertManager] ${alert.severity.toUpperCase()}: ${alert.title} — ${alert.message}`,
  )

  await Promise.allSettled([
    sendToSentry(alert),
    sendToSlack(alert),
    sendToWebhook(alert),
  ])
}

async function sendToSentry(alert: Alert): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(alert.severity === 'critical' ? 'fatal' : alert.severity === 'warning' ? 'warning' : 'info')
      scope.setTag('alert.key', alert.key)
      if (alert.meta) scope.setExtras(alert.meta)
      Sentry.captureMessage(`[Monitor] ${alert.title}: ${alert.message}`)
    })
  } catch (err) {
    logger.error({ err }, '[AlertManager] Failed to send to Sentry')
  }
}

async function sendToSlack(alert: Alert): Promise<void> {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL
  if (!url) return
  const emoji = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️'
  const payload = {
    text: `${emoji} *OmniPulse Monitor — ${alert.severity.toUpperCase()}*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${alert.title}*\n${alert.message}`,
        },
      },
      ...(alert.meta
        ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${JSON.stringify(alert.meta, null, 2)}\`\`\``,
            },
          }]
        : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Key: \`${alert.key}\` | ${new Date().toISOString()}` }],
      },
    ],
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) logger.warn({ status: res.status }, '[AlertManager] Slack webhook returned non-2xx')
  } catch (err) {
    logger.error({ err }, '[AlertManager] Failed to send to Slack')
  }
}

async function sendToWebhook(alert: Alert): Promise<void> {
  const url = process.env.MONITOR_ALERT_WEBHOOK_URL
  if (!url) return
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'omnipulse-monitor',
        ts: new Date().toISOString(),
        ...alert,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) logger.warn({ status: res.status }, '[AlertManager] Monitor webhook returned non-2xx')
  } catch (err) {
    logger.error({ err }, '[AlertManager] Failed to send to monitor webhook')
  }
}

/** Clear the dedup cache (useful in tests or after manual resolution) */
export function clearAlertCache(): void {
  dedupCache.clear()
}
