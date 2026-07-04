import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

// Per-platform alt text character limits (only for platforms with known handling in codebase)
// LinkedIn: 120 chars (standard accessible alt text limit)
export const PLATFORM_ALT_TEXT_LIMITS: Record<string, number> = {
  LINKEDIN: 120,
}

export function truncateAltText(text: string, platform: string): string {
  const limit = PLATFORM_ALT_TEXT_LIMITS[platform.toUpperCase()]
  if (!limit || text.length <= limit) return text
  const truncated = text.slice(0, limit)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
}

export async function generateAltText(
  imageUrl: string,
  fallback: string = ''
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    logger.warn('[altText] ANTHROPIC_API_KEY not set — using fallback')
    return fallback
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
              {
                type: 'text',
                text: 'Write a concise, descriptive alt text for this image in one sentence (max 120 characters). Focus on what is visually present. Output only the alt text, no quotes, no prefix.',
              },
            ],
          },
        ],
      },
      { signal: controller.signal }
    )
    clearTimeout(timeout)

    const text = response.content[0]?.type === 'text'
      ? response.content[0].text.trim()
      : ''

    if (!text) {
      logger.warn('[altText] Empty response from vision model — using fallback')
      return fallback
    }

    return text
  } catch (err: unknown) {
    clearTimeout(timeout)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    logger.error(
      { err: isAbort ? 'timeout' : err },
      '[altText] generateAltText failed — using fallback'
    )
    return fallback
  }
}

// Fire-and-forget: generate alt text and persist to MediaAsset if none set
// Never awaited by the upload handler — fully non-blocking
export function generateAndPersistAltText(
  mediaAssetId: string,
  imageUrl: string,
  fallbackText: string,
  prismaClient: { mediaAsset: { findUnique: Function; update: Function } }
): void {
  // Intentionally not awaited
  ;(async () => {
    try {
      // Only generate if no manual alt text is set
      const asset = await (prismaClient.mediaAsset as any).findUnique({
        where: { id: mediaAssetId },
        select: { altText: true },
      })
      if (asset?.altText) {
        // User already has alt text — never overwrite
        return
      }
      const generated = await generateAltText(imageUrl, fallbackText)
      if (generated) {
        await (prismaClient.mediaAsset as any).update({
          where: { id: mediaAssetId },
          data: { altText: generated },
        })
      }
    } catch (err) {
      logger.error({ err }, '[altText] generateAndPersistAltText background task failed')
    }
  })()
}
