interface SeasonalExclusion {
  startMD: string  // "MM-DD" e.g. "12-20"
  endMD: string    // "MM-DD" e.g. "01-05"
  label: string
}

/**
 * Returns true if the given date falls within any seasonal exclusion window.
 * Handles year-wrap (e.g. Dec 20 → Jan 5).
 */
export function isInSeasonalExclusion(date: Date, exclusions: SeasonalExclusion[]): boolean {
  const md = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  for (const exc of exclusions) {
    if (exc.startMD <= exc.endMD) {
      // Same-year window e.g. 03-01 to 03-31
      if (md >= exc.startMD && md <= exc.endMD) return true
    } else {
      // Year-wrap window e.g. 12-20 to 01-05
      if (md >= exc.startMD || md <= exc.endMD) return true
    }
  }
  return false
}
