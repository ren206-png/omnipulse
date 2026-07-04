import type {
  ISeoDataProvider,
  KeywordVolumeResult,
  SerpSnapshotResult,
} from '../ISeoDataProvider.js'
import { logger } from '../../../lib/logger.js'

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs = 10000
): Promise<Response | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (err: unknown) {
      clearTimeout(timer)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      logger.warn({ attempt, err: isAbort ? 'timeout' : err }, '[dataforseo] fetch failed')
      if (attempt === 2) return null
    }
  }
  return null
}

export class DataForSeoProvider implements ISeoDataProvider {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.dataforseo.com/v3'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private get authHeader(): string {
    return `Basic ${Buffer.from(this.apiKey).toString('base64')}`
  }

  async getKeywordVolume(keywords: string[]): Promise<KeywordVolumeResult[] | null> {
    try {
      const body = JSON.stringify([{ keywords: keywords.slice(0, 10), location_code: 2840, language_code: 'en' }])
      const res = await fetchWithRetry(
        `${this.baseUrl}/keywords_data/google_ads/search_volume/live`,
        {
          method: 'POST',
          headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
          body,
        }
      )
      if (!res || !res.ok) {
        logger.error({ status: res?.status }, '[dataforseo] getKeywordVolume non-ok response')
        return null
      }
      const json = await res.json() as any
      const items: any[] = json?.tasks?.[0]?.result ?? []
      return items.map((item: any) => ({
        keyword: item.keyword ?? '',
        searchVolume: item.search_volume ?? null,
        competition: item.competition_level?.toLowerCase() ?? null,
        cpc: item.cpc ?? null,
      }))
    } catch (err) {
      logger.error({ err }, '[dataforseo] getKeywordVolume failed — returning null')
      return null
    }
  }

  async getSerpSnapshot(query: string): Promise<SerpSnapshotResult | null> {
    try {
      const body = JSON.stringify([{ keyword: query, location_code: 2840, language_code: 'en', depth: 10 }])
      const res = await fetchWithRetry(
        `${this.baseUrl}/serp/google/organic/live/advanced`,
        {
          method: 'POST',
          headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
          body,
        }
      )
      if (!res || !res.ok) {
        logger.error({ status: res?.status }, '[dataforseo] getSerpSnapshot non-ok response')
        return null
      }
      const json = await res.json() as any
      const items: any[] = json?.tasks?.[0]?.result?.[0]?.items ?? []
      const organic = items.filter((i: any) => i.type === 'organic')
      return {
        query,
        results: organic.slice(0, 10).map((i: any, idx: number) => ({
          position: i.rank_absolute ?? idx + 1,
          url: i.url ?? '',
          title: i.title ?? '',
          description: i.description ?? '',
        })),
        fetchedAt: new Date().toISOString(),
      }
    } catch (err) {
      logger.error({ err }, '[dataforseo] getSerpSnapshot failed — returning null')
      return null
    }
  }
}
