/**
 * queueScheduler.ts
 *
 * Pure, side-effect-free utility for computing the next available queue slot.
 * No DB calls — accepts data as parameters so it is fully unit-testable.
 */

export interface SlotDefinition {
  id: string
  dayOfWeek: number   // 0=Sunday … 6=Saturday
  timeOfDay: string   // "HH:MM" 24-hour
  timezone: string    // IANA timezone string e.g. "America/New_York"
}

/**
 * Given a list of slot definitions and a set of already-occupied timestamps,
 * find the next calendar occurrence that is unoccupied.
 *
 * @param slots       Active QueueSlot records for the workspace
 * @param occupied    Set of ISO strings for timestamps already taken
 * @param fromDate    Search start (defaults to now)
 * @param weeksAhead  How many weeks to scan (default 8)
 * @returns           The next available Date, or null if all slots are full
 */
export function getNextAvailableSlot(
  slots: SlotDefinition[],
  occupied: Set<string>,
  fromDate: Date = new Date(),
  weeksAhead = 8,
): Date | null {
  if (slots.length === 0) return null

  // Build every slot occurrence for the next `weeksAhead` weeks, sorted asc
  const candidates: Date[] = []
  const limitMs = fromDate.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000

  for (const slot of slots) {
    const [hh, mm] = slot.timeOfDay.split(':').map(Number)

    // Walk through each day in the window
    const cursor = new Date(fromDate)
    cursor.setSeconds(0, 0)

    while (cursor.getTime() < limitMs) {
      if (cursor.getDay() === slot.dayOfWeek) {
        // Build the candidate in UTC by interpreting the time in the slot's timezone
        const candidate = toUtcFromZonedTime(cursor, slot.timezone, hh, mm)
        if (candidate.getTime() > fromDate.getTime()) {
          candidates.push(candidate)
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  // Sort chronologically
  candidates.sort((a, b) => a.getTime() - b.getTime())

  // Return first unoccupied candidate
  for (const candidate of candidates) {
    const key = candidate.toISOString()
    if (!occupied.has(key)) return candidate
  }

  return null
}

/**
 * Convert a local wall-clock time (hh, mm) on the same calendar date as
 * `localDate` in `timezone` to a UTC Date.
 *
 * Uses the Intl API (available in Node 18+) — no external dependency needed.
 */
function toUtcFromZonedTime(localDate: Date, timezone: string, hh: number, mm: number): Date {
  // Format the local date components in the target timezone
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = fmt.formatToParts(localDate)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)

  const year  = get('year')
  const month = get('month') // 1-based
  const day   = get('day')

  // Reconstruct the ISO string and let Date parse it as UTC offset
  const isoLocal = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`

  // Use Intl to find the UTC offset for this timezone at this moment
  const utcDate = new Date(`${isoLocal}Z`) // treat as UTC first to get a reference epoch
  // Then compute the actual offset
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  // Re-format the UTC reference in the target timezone
  const tzParts = tzFormatter.formatToParts(utcDate)
  const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const tzMin  = parseInt(tzParts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  const tzYear = parseInt(tzParts.find((p) => p.type === 'year')?.value ?? '0', 10)
  const tzMon  = parseInt(tzParts.find((p) => p.type === 'month')?.value ?? '0', 10)
  const tzDay_ = parseInt(tzParts.find((p) => p.type === 'day')?.value ?? '0', 10)

  const offsetMs =
    utcDate.getTime() -
    Date.UTC(tzYear, tzMon - 1, tzDay_, tzHour, tzMin, 0, 0)

  // Apply offset to get true UTC for our desired local time
  const desiredUtc = new Date(Date.UTC(year, month - 1, day, hh, mm, 0, 0) + offsetMs)
  return desiredUtc
}

/**
 * Validate an IANA timezone string.
 * Returns true if the timezone is recognised by the Intl API.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Validate a timeOfDay string ("HH:MM", 24-hour).
 */
export function isValidTimeOfDay(t: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t)
}
