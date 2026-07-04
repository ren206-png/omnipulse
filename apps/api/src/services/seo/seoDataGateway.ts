import type { ISeoDataProvider } from './ISeoDataProvider.js'
import { MockSeoProvider } from './providers/MockSeoProvider.js'
import { DataForSeoProvider } from './providers/DataForSeoProvider.js'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

let _provider: ISeoDataProvider | null = null

export function getSeoDataProvider(): ISeoDataProvider {
  if (_provider) return _provider

  const providerName = env.SEO_DATA_PROVIDER

  if (providerName === 'dataforseo') {
    const apiKey = env.SEO_DATA_API_KEY
    if (!apiKey) {
      logger.warn('[seoGateway] SEO_DATA_PROVIDER=dataforseo but SEO_DATA_API_KEY is not set — falling back to mock')
      _provider = new MockSeoProvider()
    } else {
      logger.info('[seoGateway] Using DataForSEO provider')
      _provider = new DataForSeoProvider(apiKey)
    }
  } else {
    logger.info('[seoGateway] Using Mock SEO provider')
    _provider = new MockSeoProvider()
  }

  return _provider
}
