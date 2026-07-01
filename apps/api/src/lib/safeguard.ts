import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { env } from '../config/env.js'
import { logger } from './logger.js'

export type SafeGuardStatus = 'clear' | 'warning' | 'risk'

export interface SafeGuardResult {
  status: SafeGuardStatus
  flags: string[]
}

export interface SafeGuardReport {
  [platform: string]: SafeGuardResult
}

// In-memory cache: hash → { report, expiresAt }
// TTL: 10 minutes — content rarely changes between publish-dialog opens
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { report: SafeGuardReport; expiresAt: number }>()

function cacheKey(variants: Record<string, string>): string {
  const stable = JSON.stringify(variants, Object.keys(variants).sort())
  return createHash('sha256').update(stable).digest('hex')
}

function fromCache(key: string): SafeGuardReport | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.report
}

function toCache(key: string, report: SafeGuardReport): void {
  cache.set(key, { report, expiresAt: Date.now() + CACHE_TTL_MS })
}

const SYSTEM_PROMPT = `You are a pre-publish content safety advisor for a social media scheduling tool.

Your job is to flag POTENTIAL ISSUES in social media post content — you are not making legal determinations.
Flags are advisory signals for human review, not final verdicts.

For each piece of content, return a JSON object with this exact structure:
{
  "status": "clear" | "warning" | "risk",
  "flags": ["descriptive flag string", ...]
}

Status levels:
- "clear": No notable issues detected.
- "warning": One or more possible issues that the user should review before publishing (e.g. possibly unverified claim, borderline spam behaviour, off-brand tone).
- "risk": Likely policy violation or high-confidence problematic content (e.g. explicit banned claim type, clear policy conflict, potential trademark issue).

Flag language rules:
- Use descriptive language: "possible unverified health claim" NOT "this is illegal"
- Keep flags concise (under 15 words each)
- Return an empty array [] when status is "clear"
- Never use alarming absolute language — you are advising, not adjudicating

Scan criteria:
1. Platform policy conflicts: banned claim types (miracle cures, guaranteed financial returns), excessive hashtag stuffing (>30 hashtags), deceptive urgency patterns
2. Factual red flags: unverified medical/financial/legal claims, statistics without attribution
3. Spam signals: all-caps excessive use, excessive punctuation (!!!!!), keyword stuffing
4. Brand safety: overtly divisive political content, profanity

Return ONLY valid JSON. No markdown fences, no prose.`

function failSafe(platform: string): SafeGuardResult {
  return {
    status: 'warning',
    flags: ['Safety scan unavailable — review manually before publishing'],
  }
}

function validateResult(raw: unknown): SafeGuardResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not an object')
  const r = raw as Record<string, unknown>
  if (!['clear', 'warning', 'risk'].includes(r.status as string)) throw new Error('Invalid status')
  if (!Array.isArray(r.flags)) throw new Error('flags must be array')
  return {
    status: r.status as SafeGuardStatus,
    flags: (r.flags as unknown[]).filter((f): f is string => typeof f === 'string'),
  }
}

async function scanSingle(client: Anthropic, platform: string, content: string, attempt = 1): Promise<SafeGuardResult> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Platform: ${platform}\n\nContent to scan:\n"${content.trim()}"`,
      }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error(`JSON parse failed: ${text.slice(0, 200)}`)
    }

    return validateResult(parsed)
  } catch (err) {
    if (attempt === 1) {
      logger.warn({ err, platform }, 'SafeGuard: first scan attempt failed, retrying')
      return scanSingle(client, platform, content, 2)
    }
    // Both attempts failed — fail safe to warning, never to clear
    logger.error({ err, platform }, 'SafeGuard: both scan attempts failed, returning fail-safe warning')
    return failSafe(platform)
  }
}

export async function scanContent(
  variants: Record<string, string>,
): Promise<SafeGuardReport> {
  if (!env.ANTHROPIC_API_KEY) {
    // Fail safe — return warning for each platform
    return Object.fromEntries(
      Object.keys(variants).map((p) => [p, failSafe(p)])
    )
  }

  // Check cache first
  const key = cacheKey(variants)
  const cached = fromCache(key)
  if (cached) {
    logger.info({ platforms: Object.keys(variants) }, 'SafeGuard: cache hit')
    return cached
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  // Scan all platforms in parallel
  const entries = Object.entries(variants)
  const results = await Promise.all(
    entries.map(([platform, content]) => scanSingle(client, platform, content))
  )

  const report: SafeGuardReport = Object.fromEntries(
    entries.map(([platform], i) => [platform, results[i]])
  )

  toCache(key, report)
  logger.info({ platforms: Object.keys(variants) }, 'SafeGuard: scan complete')
  return report
}
