import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

export interface SeoMetadataResult {
  meta_title: string
  meta_description: string
  og_tags: {
    'og:title': string
    'og:description': string
    'og:type': string
    'og:image': string | null
  }
  keywords: [string, string, string, string, string] // exactly 5
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const truncated = text.slice(0, maxLen)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
}

function validateResult(raw: unknown): SeoMetadataResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.meta_title !== 'string') return null
  if (typeof r.meta_description !== 'string') return null
  if (!r.og_tags || typeof r.og_tags !== 'object') return null
  if (!Array.isArray(r.keywords) || r.keywords.length !== 5) return null
  if (!r.keywords.every((k: unknown) => typeof k === 'string')) return null
  const og = r.og_tags as Record<string, unknown>
  if (typeof og['og:title'] !== 'string') return null
  if (typeof og['og:description'] !== 'string') return null
  if (typeof og['og:type'] !== 'string') return null
  return {
    meta_title: truncateAtWordBoundary(r.meta_title as string, 60),
    meta_description: truncateAtWordBoundary(r.meta_description as string, 160),
    og_tags: {
      'og:title': truncateAtWordBoundary(og['og:title'] as string, 60),
      'og:description': truncateAtWordBoundary(og['og:description'] as string, 160),
      'og:type': og['og:type'] as string,
      'og:image': typeof og['og:image'] === 'string' ? og['og:image'] : null,
    },
    keywords: r.keywords as [string, string, string, string, string],
  }
}

export async function generateSeoMetadata(
  postContent: string,
  context?: { platforms?: string[]; workspaceId?: string }
): Promise<SeoMetadataResult | null> {
  if (!env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — skipping SEO metadata generation')
    return null
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const platformHint = context?.platforms?.length
    ? `Target platforms: ${context.platforms.join(', ')}.`
    : ''

  const prompt = `You are an SEO expert. Analyze the following social media post and generate SEO metadata.
${platformHint}

Post content:
"""
${postContent.slice(0, 2000)}
"""

Respond with ONLY a valid JSON object — no prose, no markdown, no code fences. The JSON must have exactly these fields:
{
  "meta_title": "string, max 60 chars",
  "meta_description": "string, max 160 chars",
  "og_tags": {
    "og:title": "string, max 60 chars",
    "og:description": "string, max 160 chars",
    "og:type": "article",
    "og:image": null
  },
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}
keywords must be an array of exactly 5 strings relevant to the post content.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal }
    )
    clearTimeout(timeout)

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // retry once with stricter instruction
      logger.warn({ text }, '[seo] JSON parse failed on first attempt — retrying')
      const retry = await client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: text },
            { role: 'user', content: 'Your response was not valid JSON. Reply with ONLY the raw JSON object, nothing else.' },
          ],
        },
        { signal: controller.signal },
      )
      const retryText = retry.content[0]?.type === 'text' ? retry.content[0].text.trim() : ''
      try {
        parsed = JSON.parse(retryText)
      } catch {
        logger.error({ retryText }, '[seo] JSON parse failed on retry — returning null')
        return null
      }
    }

    const result = validateResult(parsed)
    if (!result) {
      logger.error({ parsed }, '[seo] SEO metadata validation failed — returning null')
      return null
    }
    return result
  } catch (err: unknown) {
    clearTimeout(timeout)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    logger.error({ err: isAbort ? 'timeout' : err }, '[seo] generateSeoMetadata failed — returning null')
    return null
  }
}
