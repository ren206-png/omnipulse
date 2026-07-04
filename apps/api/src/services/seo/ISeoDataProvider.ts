export interface KeywordVolumeResult {
  keyword: string
  searchVolume: number | null      // null = unknown
  competition: 'low' | 'medium' | 'high' | null
  cpc: number | null               // cost-per-click in USD
}

export interface SerpResult {
  position: number
  url: string
  title: string
  description: string
}

export interface SerpSnapshotResult {
  query: string
  results: SerpResult[]
  fetchedAt: string                // ISO timestamp
}

export interface ISeoDataProvider {
  /**
   * Returns volume/competition data for up to 10 keywords.
   * Returns null on provider error (fail-open).
   */
  getKeywordVolume(keywords: string[]): Promise<KeywordVolumeResult[] | null>

  /**
   * Returns a SERP snapshot for a query string.
   * Returns null on provider error (fail-open).
   */
  getSerpSnapshot(query: string): Promise<SerpSnapshotResult | null>
}
