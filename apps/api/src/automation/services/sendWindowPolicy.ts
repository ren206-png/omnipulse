/**
 * Automation Engine — Send Window Policy
 *
 * Enforces time-of-day quiet hours to avoid messaging contacts outside
 * acceptable hours. Configuration is workspace-level and defaults to a
 * permissive 8:00–21:00 UTC window if not specified.
 *
 * Returns:
 *   { allowed: true }                   — send now
 *   { allowed: false, retryAt: Date }   — defer to retryAt
 *
 * Note: this is a pure function over the current time and workspace config.
 * It has no side-effects and is easy to unit-test.
 */

export interface SendWindowConfig {
  /** UTC hour (0–23) at which sending is allowed to start (inclusive). Default 8. */
  startHourUtc?: number
  /** UTC hour (0–23) at which sending must stop (exclusive). Default 21. */
  endHourUtc?: number
  /** Days of the week (0=Sun … 6=Sat) on which sending is blocked entirely. Default []. */
  blockedDays?: number[]
}

export interface SendWindowResult {
  allowed: boolean
  retryAt?: Date
}

const DEFAULT_START = 8   // 08:00 UTC
const DEFAULT_END   = 21  // 21:00 UTC (exclusive)

/**
 * Determine whether a message can be sent at the given time under the policy.
 */
export function checkSendWindow(
  now: Date = new Date(),
  config: SendWindowConfig = {},
): SendWindowResult {
  const start       = config.startHourUtc  ?? DEFAULT_START
  const end         = config.endHourUtc    ?? DEFAULT_END
  const blockedDays = config.blockedDays   ?? []

  const dayOfWeek   = now.getUTCDay()
  const hourOfDay   = now.getUTCHours()

  // Blocked day of week
  if (blockedDays.includes(dayOfWeek)) {
    const retryAt = nextAllowedTime(now, start, end, blockedDays)
    return { allowed: false, retryAt }
  }

  // Outside window
  if (hourOfDay < start || hourOfDay >= end) {
    const retryAt = nextAllowedTime(now, start, end, blockedDays)
    return { allowed: false, retryAt }
  }

  return { allowed: true }
}

function nextAllowedTime(now: Date, start: number, end: number, blockedDays: number[]): Date {
  // Start from the next occurrence of startHourUtc
  const candidate = new Date(now)
  candidate.setUTCMinutes(0, 0, 0)

  // If we're before start today, snap to start today
  if (now.getUTCHours() < start && !blockedDays.includes(now.getUTCDay())) {
    candidate.setUTCHours(start)
    return candidate
  }

  // Otherwise advance to tomorrow's start (loop to skip blocked days)
  candidate.setUTCHours(start)
  candidate.setUTCDate(candidate.getUTCDate() + 1)

  let safety = 0
  while (blockedDays.includes(candidate.getUTCDay()) && safety++ < 7) {
    candidate.setUTCDate(candidate.getUTCDate() + 1)
  }

  return candidate
}
