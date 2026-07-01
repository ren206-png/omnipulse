import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'
import { logger } from './logger.js'

export interface VariantResult {
  platform: string
  content: string
  hashtags: string[]
  mediaUrls: string[]
}

interface MultiplierOutput {
  FACEBOOK: VariantResult
  INSTAGRAM: VariantResult
  TIKTOK: VariantResult
  X: VariantResult
}

const VARIANT_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X'] as const

const PLATFORM_RULES = {
  X:         'Max 280 characters TOTAL including spaces and hashtags. No exceptions. Punchy, direct hook. 0–2 hashtags only.',
  FACEBOOK:  'Conversational, can be longer (up to 500 chars ideal). Story or question format. 1–3 hashtags.',
  INSTAGRAM: 'Engaging caption 150–300 chars. End with a blank line then exactly 10 hashtags prefixed with #.',
  TIKTOK:    'Casual, energetic, trend-aware. 100–200 chars. Include 3–5 hashtags prefixed with #.',
}

const SCHEMA = `{
  "FACEBOOK":  { "content": "string", "hashtags": ["string"], "mediaUrls": [] },
  "INSTAGRAM": { "content": "string", "hashtags": ["string"], "mediaUrls": [] },
  "TIKTOK":    { "content": "string", "hashtags": ["string"], "mediaUrls": [] },
  "X":         { "content": "string", "hashtags": ["string"], "mediaUrls": [] }
}`

function buildPrompt(masterContent: string, brandName?: string): { system: string; user: string } {
  const brand = brandName ? `Brand: ${brandName}` : ''
  const system = `You are an expert social media strategist. Given a master post, you generate platform-optimised variants.

CRITICAL RULES:
1. Return ONLY a valid JSON object matching the exact schema below — no markdown fences, no prose, no explanation.
2. Each platform variant must follow its platform rules strictly.
3. X variant MUST be ≤ 280 characters total (content + hashtags combined if included inline, or content alone if hashtags are separate).
4. hashtags array must contain strings WITHOUT the # prefix (e.g. "marketing" not "#marketing").
5. mediaUrls must always be an empty array [].
${brand}

Platform rules:
- FACEBOOK: ${PLATFORM_RULES.FACEBOOK}
- INSTAGRAM: ${PLATFORM_RULES.INSTAGRAM}
- TIKTOK: ${PLATFORM_RULES.TIKTOK}
- X: ${PLATFORM_RULES.X}

Required JSON schema (return exactly this structure):
${SCHEMA}`

  const user = `Master post content:
"${masterContent.trim()}"

Generate platform-tailored variants. Return only the JSON object.`

  return { system, user }
}

function validateAndEnforce(raw: unknown): MultiplierOutput {
  if (typeof raw !== 'object' || raw === null) throw new Error('Response is not an object')

  const result: Partial<MultiplierOutput> = {}

  for (const platform of VARIANT_PLATFORMS) {
    const variant = (raw as Record<string, unknown>)[platform]
    if (!variant || typeof variant !== 'object') {
      throw new Error(`Missing platform: ${platform}`)
    }
    const v = variant as Record<string, unknown>
    if (typeof v.content !== 'string') throw new Error(`${platform}.content must be a string`)

    let content = v.content as string
    const hashtags = Array.isArray(v.hashtags)
      ? (v.hashtags as unknown[]).filter((h): h is string => typeof h === 'string').map((h) => h.replace(/^#/, ''))
      : []

    // Server-side enforce X 280-char limit (content only — hashtags are separate)
    if (platform === 'X' && content.length > 280) {
      content = content.slice(0, 277) + '…'
      logger.warn({ originalLength: (v.content as string).length }, 'X variant truncated to 280 chars')
    }

    result[platform] = { platform, content, hashtags, mediaUrls: [] }
  }

  return result as MultiplierOutput
}

export async function generateVariants(
  masterContent: string,
  brandName?: string,
): Promise<MultiplierOutput> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const { system, user } = buildPrompt(masterContent, brandName)

  async function attempt(extraInstruction = ''): Promise<MultiplierOutput> {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user + extraInstruction }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''

    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error(`JSON parse failed. Raw response: ${text.slice(0, 200)}`)
    }

    return validateAndEnforce(parsed)
  }

  // First attempt
  try {
    return await attempt()
  } catch (firstErr) {
    logger.warn({ err: firstErr }, 'Content Multiplier: first attempt failed, retrying with schema reinforcement')
  }

  // One retry with stronger schema instruction
  return attempt('\n\nIMPORTANT: Your previous response could not be parsed. Return ONLY valid JSON — no markdown, no text outside the JSON object.')
}
