import type {
  ISeoDataProvider,
  KeywordVolumeResult,
  SerpSnapshotResult,
} from '../ISeoDataProvider.js'

export class MockSeoProvider implements ISeoDataProvider {
  async getKeywordVolume(keywords: string[]): Promise<KeywordVolumeResult[]> {
    // Deterministic mock — same keyword always returns same volume
    return keywords.slice(0, 10).map((keyword) => ({
      keyword,
      searchVolume: (keyword.length * 1234) % 50000,
      competition: (['low', 'medium', 'high'] as const)[keyword.length % 3],
      cpc: parseFloat(((keyword.length * 0.17) % 10).toFixed(2)),
    }))
  }

  async getSerpSnapshot(query: string): Promise<SerpSnapshotResult> {
    return {
      query,
      results: Array.from({ length: 5 }, (_, i) => ({
        position: i + 1,
        url: `https://example${i + 1}.com/${query.replace(/\s+/g, '-')}`,
        title: `${query} — Result ${i + 1}`,
        description: `Mock SERP result ${i + 1} for query: ${query}`,
      })),
      fetchedAt: new Date().toISOString(),
    }
  }
}
