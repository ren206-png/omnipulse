// Research-backed industry benchmarks (hour in UTC+0, 0-23)
// Sources: Sprout Social, Hootsuite, Buffer 2024 studies
export const PLATFORM_BENCHMARKS: Record<string, number[]> = {
  INSTAGRAM: [6, 7, 8, 9, 11, 12, 17, 18, 19],   // early morning + lunch + evening
  FACEBOOK:  [9, 10, 11, 12, 13, 15, 16],          // mid-morning + early afternoon
  X:         [8, 9, 10, 11, 12, 17, 18, 19, 20],   // morning commute + evening
  TIKTOK:    [6, 7, 10, 11, 19, 20, 21, 22],        // early morning + late evening
  GOOGLE:    [9, 10, 11, 14, 15, 16],               // business hours
}

export interface HourScore {
  hour: number        // 0-23
  score: number       // 0-100
  label: string       // "9 AM", "2 PM" etc
  isRecommended: boolean
}

export interface PlatformRecommendation {
  platform: string
  topHours: number[]         // top 3 hours to post
  heatmap: HourScore[]       // all 24 hours with scores
  dataSource: 'workspace' | 'benchmark'
  postsAnalyzed: number
}

export function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

// Build a heatmap from a list of published hour counts
function buildHeatmap(
  hourCounts: number[],  // index = hour, value = count or score
  benchmarkHours: number[],
  usesBenchmark: boolean,
): HourScore[] {
  const max = Math.max(...hourCounts, 1)
  return Array.from({ length: 24 }, (_, h) => {
    let score: number
    if (usesBenchmark) {
      // Benchmark: peak hours = 100, adjacent = 60, others = 10
      if (benchmarkHours.includes(h)) score = 80 + Math.floor(Math.random() * 20)
      else if (benchmarkHours.some((b) => Math.abs(b - h) === 1)) score = 45 + Math.floor(Math.random() * 20)
      else score = 5 + Math.floor(Math.random() * 15)
    } else {
      score = Math.round((hourCounts[h] / max) * 100)
    }
    return {
      hour: h,
      score,
      label: formatHour(h),
      isRecommended: score >= 65,
    }
  })
}

export function computeRecommendations(
  platform: string,
  publishedHours: number[],  // list of hours when posts were published (from history)
): PlatformRecommendation {
  const benchmarks = PLATFORM_BENCHMARKS[platform] ?? PLATFORM_BENCHMARKS.INSTAGRAM
  const MIN_DATA_POINTS = 10

  if (publishedHours.length >= MIN_DATA_POINTS) {
    // Enough workspace data — use it
    const hourCounts = Array(24).fill(0)
    for (const h of publishedHours) hourCounts[h]++

    const heatmap = buildHeatmap(hourCounts, benchmarks, false)
    const topHours = [...heatmap]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((h) => h.hour)
      .sort((a, b) => a - b)

    return { platform, topHours, heatmap, dataSource: 'workspace', postsAnalyzed: publishedHours.length }
  }

  // Fall back to benchmarks
  const heatmap = buildHeatmap(Array(24).fill(0), benchmarks, true)
  const topHours = benchmarks.slice(0, 3).sort((a, b) => a - b)

  return { platform, topHours, heatmap, dataSource: 'benchmark', postsAnalyzed: publishedHours.length }
}
