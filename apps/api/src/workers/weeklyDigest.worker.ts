/**
 * Weekly Digest Worker
 *
 * Sends a weekly performance summary email to every workspace owner
 * every Monday between 08:00–09:00 UTC.
 *
 * Uses the existing sendWeeklyDigest() function from lib/digest.ts.
 * Tracks last-sent time via a simple in-memory flag (restarts are safe —
 * the Monday window is 1 hour wide so a restart within that window re-fires,
 * but Resend deduplication and the fact that the email is idempotent means
 * no harm done).
 */

import { logger } from '../lib/logger.js'
import { sendWeeklyDigest } from '../lib/digest.js'
import { heartbeat } from '../lib/workerHeartbeat.js'

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // check every 30 minutes
const DIGEST_HOUR_UTC = 8  // send at 08:xx UTC
const DIGEST_DAY = 1        // Monday (0 = Sunday)

let lastSentDate: string | null = null // 'YYYY-MM-DD' of last send

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

async function maybeSendDigest(): Promise<void> {
  const now = new Date()
  const day = now.getUTCDay()
  const hour = now.getUTCHours()

  // Only fire on Monday between 08:00 and 09:00 UTC
  if (day !== DIGEST_DAY || hour !== DIGEST_HOUR_UTC) return

  const key = todayKey()
  if (lastSentDate === key) return // already sent this Monday

  lastSentDate = key
  logger.info('[WeeklyDigest] Sending weekly digests…')

  try {
    await sendWeeklyDigest()
    logger.info('[WeeklyDigest] All digests sent')
    await heartbeat('weekly-digest')
  } catch (err) {
    logger.error({ err }, '[WeeklyDigest] Failed to send digests')
    // Reset so it retries within the same hour window if the error was transient
    lastSentDate = null
  }
}

let _started = false

export function startWeeklyDigestWorker(): void {
  if (_started) return
  _started = true

  // Check immediately, then every 30 minutes
  maybeSendDigest().catch((err) => logger.error({ err }, '[WeeklyDigest] Initial check failed'))

  setInterval(() => {
    maybeSendDigest().catch((err) => logger.error({ err }, '[WeeklyDigest] Check failed'))
  }, CHECK_INTERVAL_MS)

  logger.info('[WeeklyDigest] Worker registered — checks every 30 minutes, sends Mondays at 08:00 UTC')
}
