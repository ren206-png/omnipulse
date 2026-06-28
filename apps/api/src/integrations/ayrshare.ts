import 'dotenv/config'
import { createRequire } from 'module'
import { AppError } from '../lib/apiError.js'

const require = createRequire(import.meta.url)

type AyrshareSDK = {
  post(params: {
    post: string
    platforms: string[]
    mediaUrls?: string[]
    profileKey?: string
  }): Promise<{
    status: string
    postIds?: string[]
    errors?: unknown[]
    [key: string]: unknown
  }>
  setTwitterByo(apiKey: string, apiSecret: string): AyrshareSDK
  analyticsPost(params: { id: string }): Promise<unknown>
  analyticsLinks(params: { profileKey: string }): Promise<{
    followers?: number
    impressions?: number
    engagementRate?: number
    [key: string]: unknown
  }>
}

const PLATFORM_MAP: Record<string, string> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  X: 'twitter',
  GOOGLE: 'gmb',
}

export class AyrshareService {
  private social: AyrshareSDK

  constructor() {
    const apiKey = process.env.AYRSHARE_API_KEY
    if (!apiKey) {
      throw new AppError(500, 'CONFIGURATION_ERROR', 'AYRSHARE_API_KEY is not configured')
    }
    try {
      const SocialPost = require('social-media-api') as { default?: new (k: string) => AyrshareSDK } & (new (k: string) => AyrshareSDK)
      const Ctor = (SocialPost as any).default ?? SocialPost
      this.social = new Ctor(apiKey)
    } catch {
      throw new AppError(500, 'CONFIGURATION_ERROR', 'social-media-api package not available')
    }
  }

  setTwitterCredentials(xApiKey: string, xApiSecret: string): void {
    this.social = this.social.setTwitterByo(xApiKey, xApiSecret)
  }

  async publishPost(params: {
    platforms: string[]
    content: string
    mediaUrls: string[]
    profileKey?: string
  }): Promise<{ status: 'success' | 'error'; postIds: string[]; rawResponse: unknown }> {
    const sdkPlatforms = params.platforms.map((p) => PLATFORM_MAP[p] ?? p.toLowerCase())

    const rawResponse = await this.social.post({
      post: params.content,
      platforms: sdkPlatforms,
      mediaUrls: params.mediaUrls.length > 0 ? params.mediaUrls : undefined,
      profileKey: params.profileKey,
    })

    const postIds = rawResponse.postIds ?? []
    const status = rawResponse.status === 'success' ? 'success' : 'error'
    return { status, postIds, rawResponse }
  }

  async getAnalytics(profileKey: string): Promise<{
    followers: number
    impressions: number
    engagementRate: number
  }> {
    const raw = await this.social.analyticsLinks({ profileKey })
    return {
      followers: typeof raw.followers === 'number' ? raw.followers : 0,
      impressions: typeof raw.impressions === 'number' ? raw.impressions : 0,
      engagementRate: typeof raw.engagementRate === 'number' ? raw.engagementRate : 0,
    }
  }
}
