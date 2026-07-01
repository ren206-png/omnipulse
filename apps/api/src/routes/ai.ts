import { Router } from 'express'
import type { Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import IORedis from 'ioredis'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendError } from '../lib/apiError.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'
import { PLAN_LIMITS } from '../lib/plans.js'
import type { Plan } from '../lib/plans.js'
import { generateVariants } from '../lib/contentMultiplier.js'
import { scanContent } from '../lib/safeguard.js'
import { generateCaption } from '../lib/visualCopywriter.js'
import { logActivity } from '../lib/activity.js'

// Singleton Redis for AI rate-limit counters
let _aiRedis: IORedis | null = null
function getAiRedis(): IORedis {
  if (!_aiRedis) _aiRedis = new IORedis(env.REDIS_URL, { lazyConnect: true, enableReadyCheck: false })
  return _aiRedis
}

async function checkDailyLimit(userId: string, key: string, limit: number): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const redis = getAiRedis()
  const today = new Date().toISOString().slice(0, 10)
  const redisKey = `${key}:${userId}:${today}`
  const current = parseInt((await redis.get(redisKey)) ?? '0', 10)
  const allowed = current < limit
  // TTL: seconds until midnight UTC
  const now = new Date()
  const midnight = new Date(today)
  midnight.setUTCDate(midnight.getUTCDate() + 1)
  const ttl = Math.ceil((midnight.getTime() - now.getTime()) / 1000)
  return { allowed, remaining: Math.max(0, limit - current), resetAt: midnight.toISOString() }
}

async function incrementDailyLimit(userId: string, key: string): Promise<void> {
  const redis = getAiRedis()
  const today = new Date().toISOString().slice(0, 10)
  const redisKey = `${key}:${userId}:${today}`
  const now = new Date()
  const midnight = new Date(today)
  midnight.setUTCDate(midnight.getUTCDate() + 1)
  const ttl = Math.ceil((midnight.getTime() - now.getTime()) / 1000)
  const pipeline = redis.pipeline()
  pipeline.incr(redisKey)
  pipeline.expire(redisKey, ttl)
  await pipeline.exec()
}

const router = Router()

const PLATFORM_LIMITS: Record<string, number> = {
  X:         280,
  FACEBOOK:  63206,
  INSTAGRAM: 2200,
  TIKTOK:    2200,
  GOOGLE:    1500,
}

const PLATFORM_GUIDANCE: Record<string, string> = {
  X:         'Maximum 280 characters including spaces. Punchy, direct, no hashtag spam (max 2). Make every word count.',
  FACEBOOK:  'Conversational, can be longer. Ask a question or tell a story. 1-2 relevant hashtags max.',
  INSTAGRAM: 'Engaging caption. Include 5-10 relevant hashtags at the end on a new line. Emojis welcome.',
  TIKTOK:    'Casual, trend-aware, energetic. Include 3-5 trending hashtags. Short and punchy.',
  GOOGLE:    'Professional, clear call-to-action. Under 1500 characters. No hashtags needed.',
}

const TONES: Record<string, string> = {
  casual:       'Friendly, conversational, approachable — like talking to a friend.',
  professional: 'Polished, authoritative, credible — suitable for B2B and corporate audiences.',
  enthusiastic: 'High energy, exciting, hype-building — great for product launches and announcements.',
  informative:  'Educational, clear, value-driven — teaches the reader something useful.',
  witty:        'Clever, playful, a little cheeky — memorable and shareable.',
}

// 30 AI generations per hour per user
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'AI generation limit reached — please wait before generating more content',
})

router.use(requireAuth)

router.post('/generate', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }

  // Plan gate: AI requires PRO or AGENCY
  const { workspaceId } = req.body as { workspaceId?: string }
  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (workspace) {
      const limits = PLAN_LIMITS[workspace.plan as Plan]
      if (limits.aiGenerations === 0) {
        sendError(res, 402, 'PLAN_LIMIT', 'AI content generation requires a Pro or Agency plan. Upgrade to unlock this feature.')
        return
      }
    }
  }

  const { prompt, platforms, tone = 'casual', variations = 1 } = req.body as {
    prompt?: string
    platforms?: string[]
    tone?: string
    variations?: number
  }

  if (!prompt || !prompt.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'prompt is required')
    return
  }
  if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
    sendError(res, 400, 'MISSING_FIELD', 'platforms array is required')
    return
  }
  if (!TONES[tone]) {
    sendError(res, 400, 'INVALID_TONE', `tone must be one of: ${Object.keys(TONES).join(', ')}`)
    return
  }

  const numVariations = Math.min(Math.max(1, variations), 3)
  const strictestLimit = Math.min(...platforms.map((p) => PLATFORM_LIMITS[p] ?? 2200))
  const platformGuidance = platforms
    .map((p) => `- ${p}: ${PLATFORM_GUIDANCE[p] ?? 'Standard social media post.'}`)
    .join('\n')

  const systemPrompt = `You are an elite social media copywriter for the world's top brands. You write posts that stop the scroll, drive engagement, and sound authentically human — never like AI.

Rules you never break:
1. Return ONLY the post content — zero labels, zero explanations, zero "Here's your post:" preamble
2. Respect character limits absolutely — never exceed them
3. Match the tone exactly as specified
4. Write for humans, not algorithms — authentic voice over keyword stuffing
5. If generating multiple variations, separate each with exactly "---" on its own line and nothing else`

  const userPrompt = `Write ${numVariations === 1 ? '1 social media post' : `${numVariations} variations of a social media post`} about the following:

"${prompt.trim()}"

Tone: ${TONES[tone]}

Platform requirements:
${platformGuidance}

Strictest character limit across selected platforms: ${strictestLimit} characters.
${platforms.includes('X') ? 'CRITICAL: Must be under 280 characters since X (Twitter) is selected.' : ''}

${numVariations > 1 ? `Generate exactly ${numVariations} distinct variations separated by "---". Each variation should take a different angle or hook.` : ''}`

  // Stream the response back to the client
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()

    logger.info({ userId: req.user!.id, platforms, tone, variations: numVariations }, 'AI content generated')
  } catch (err) {
    logger.error({ err }, 'AI generation error')
    res.write(`data: ${JSON.stringify({ error: 'Generation failed — please try again' })}\n\n`)
    res.end()
  }
})

const HASHTAG_GUIDANCE: Record<string, string> = {
  X:         'Return 5 hashtags max. X penalises hashtag spam. Only include if they add real discoverability.',
  FACEBOOK:  'Return 3-5 hashtags. Facebook reach is mostly organic, keep them niche and relevant.',
  INSTAGRAM: 'Return 15 hashtags. Mix: 3 broad (>1M posts), 6 mid-tier (100k-1M), 6 niche (<100k) for best reach.',
  TIKTOK:    'Return 8-10 hashtags. Include 2-3 trending/challenge tags plus niche ones relevant to the content.',
  GOOGLE:    'Return 3 hashtags max. Google Business posts rarely use hashtags — only if clearly relevant.',
}

router.post('/hashtags', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }

  const { workspaceId, content, platforms } = req.body as {
    workspaceId?: string
    content?: string
    platforms?: string[]
  }

  if (!content?.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'content is required')
    return
  }
  if (!platforms?.length) {
    sendError(res, 400, 'MISSING_FIELD', 'platforms array is required')
    return
  }

  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (workspace) {
      const limits = PLAN_LIMITS[workspace.plan as Plan]
      if (limits.aiGenerations === 0) {
        sendError(res, 402, 'PLAN_LIMIT', 'AI hashtag suggestions require a Pro or Agency plan.')
        return
      }
    }
  }

  const platformGuidance = platforms
    .map((p) => `${p}: ${HASHTAG_GUIDANCE[p] ?? 'Return 5-10 relevant hashtags.'}`)
    .join('\n')

  const systemPrompt = `You are a social media hashtag strategist. Your job is to suggest highly relevant, high-performing hashtags for the given content and platforms.

Rules:
1. Return ONLY a JSON object — no prose, no explanation
2. The JSON must have a key for each platform with an array of hashtag strings (including the # symbol)
3. Every hashtag must be directly relevant to the content — no vanity tags like #love or #follow
4. Do not repeat hashtags across platforms unless genuinely relevant to both`

  const userPrompt = `Content: "${content.trim()}"

Platforms: ${platforms.join(', ')}

Guidance per platform:
${platformGuidance}

Return JSON like: { "INSTAGRAM": ["#tag1", "#tag2"], "X": ["#tag1"] }`

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const hashtags = jsonMatch ? JSON.parse(jsonMatch[0]) as Record<string, string[]> : {}

    res.json({ hashtags })
    logger.info({ userId: req.user!.id, platforms }, 'Hashtags generated')
  } catch (err) {
    logger.error({ err }, 'Hashtag generation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate hashtags')
  }
})

router.post('/hashtag-research', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }

  const { topic, platform } = req.body as { topic?: string; platform?: string }

  if (!topic?.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'topic is required')
    return
  }
  if (!platform?.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'platform is required')
    return
  }

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Suggest hashtags for the topic: "${topic}" on ${platform}.\nReturn a JSON array of objects: [{ tag: "#hashtag", size: "mega|large|medium|niche", estimated_posts: "number string like '2.4M'" }]\nMega = >10M posts, Large = 1M-10M, Medium = 100K-1M, Niche = <100K.\nReturn exactly 20 hashtags, mix of sizes. Return ONLY valid JSON array, no prose.`,
      }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      sendError(res, 500, 'PARSE_ERROR', 'Failed to parse hashtag response')
      return
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ tag: string; size: string; estimated_posts: string }>
    const hashtags = parsed.map((h) => ({
      tag: h.tag,
      size: h.size,
      estimatedPosts: h.estimated_posts,
    }))

    res.json({ hashtags })
    logger.info({ userId: req.user!.id, topic, platform }, 'Hashtag research completed')
  } catch (err) {
    logger.error({ err }, 'Hashtag research error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to research hashtags')
  }
})

router.post('/link-preview', async (req: Request, res: Response): Promise<void> => {
  const { url } = req.body as { url?: string }

  if (!url || !url.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'url is required')
    return
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url.trim())
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      sendError(res, 400, 'INVALID_URL', 'Only http and https URLs are supported')
      return
    }
  } catch {
    sendError(res, 400, 'INVALID_URL', 'Invalid URL')
    return
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let html: string
    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'OmniPulse/1.0 (link preview bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      })
      clearTimeout(timeout)
      if (!response.ok) {
        sendError(res, 400, 'FETCH_FAILED', `Failed to fetch URL: ${response.status}`)
        return
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
        sendError(res, 400, 'NOT_HTML', 'URL does not return HTML content')
        return
      }
      html = await response.text()
    } catch (err) {
      clearTimeout(timeout)
      sendError(res, 400, 'FETCH_FAILED', 'Failed to fetch URL — it may be unreachable or timed out')
      return
    }

    function extractOg(property: string): string | null {
      // Match <meta property="og:xxx" content="..."> in any attribute order
      const re = new RegExp(
        `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*?)["'][^>]*>|` +
        `<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']${property}["'][^>]*>`,
        'i'
      )
      const m = re.exec(html)
      return m ? (m[1] ?? m[2] ?? null) : null
    }

    function extractMeta(name: string): string | null {
      const re = new RegExp(
        `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*?)["'][^>]*>|` +
        `<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']${name}["'][^>]*>`,
        'i'
      )
      const m = re.exec(html)
      return m ? (m[1] ?? m[2] ?? null) : null
    }

    function extractTitle(): string | null {
      const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
      return m ? m[1].trim() : null
    }

    const title = extractOg('og:title') ?? extractMeta('title') ?? extractTitle()
    const description = extractOg('og:description') ?? extractMeta('description')
    const image = extractOg('og:image')
    const siteName = extractOg('og:site_name') ?? parsedUrl.hostname

    res.json({
      title: title ? title.trim() : null,
      description: description ? description.trim() : null,
      image: image ? image.trim() : null,
      siteName: siteName ? siteName.trim() : null,
      url: parsedUrl.toString(),
    })

    logger.info({ userId: req.user!.id, url: parsedUrl.toString() }, 'Link preview fetched')
  } catch (err) {
    logger.error({ err }, 'Link preview error')
    sendError(res, 400, 'FETCH_FAILED', 'Failed to fetch link preview')
  }
})

router.post('/content-calendar', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }
  const { niche, tone = 'Casual', platforms = ['INSTAGRAM'], weeks = 1 } = req.body as {
    niche?: string; tone?: string; platforms?: string[]; weeks?: number
  }
  if (!niche?.trim()) { sendError(res, 400, 'MISSING_FIELD', 'niche is required'); return }
  const numWeeks = Math.min(Math.max(1, weeks), 4)
  const totalPosts = numWeeks * platforms.length * 3

  const systemPrompt = `You are a social media strategist. Generate a realistic content calendar. Return ONLY a valid JSON array, no prose, no markdown.`
  const userPrompt = `Create a ${numWeeks}-week social media content calendar for a ${niche} brand.
Tone: ${tone}
Platforms: ${platforms.join(', ')}

Return a JSON array of exactly ${totalPosts} posts:
[{"week":1,"day":1,"platform":"INSTAGRAM","type":"Educational","hook":"opening line","content":"full post text"}]

day is 1-7 (Monday=1). Vary content types: Educational, Promotional, Behind the Scenes, User Generated Content, Trending.
Distribute evenly across platforms and days. Write ready-to-publish content.`

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })
    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    res.json({ plan })
    logger.info({ userId: req.user!.id, niche, platforms, weeks: numWeeks }, 'AI calendar generated')
  } catch (err) {
    logger.error({ err }, 'AI calendar generation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate calendar')
  }
})

// POST /api/v1/ai/generate-image
router.post('/generate-image', async (req: Request, res: Response): Promise<void> => {
  const { prompt, width = 1024, height = 1024 } = req.body as { prompt?: string; width?: number; height?: number }
  if (!prompt) { sendError(res, 400, 'MISSING_PROMPT', 'prompt required'); return }
  try {
    // Pollinations.ai — completely free, no API key
    const encoded = encodeURIComponent(prompt)
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&model=flux`
    res.json({ imageUrl })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate image')
  }
})

// POST /api/v1/ai/translate
router.post('/translate', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  const { text, targetLanguage } = req.body as { text?: string; targetLanguage?: string }
  if (!text || !targetLanguage) { sendError(res, 400, 'MISSING_PARAMS', 'text and targetLanguage required'); return }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Translate the following social media caption to ${targetLanguage}. Keep hashtags as-is. Only return the translated text, nothing else:\n\n${text}`,
      }],
    })
    const translated = message.content[0].type === 'text' ? message.content[0].text : ''
    res.json({ translated })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Translation failed')
  }
})

// POST /api/v1/ai/score-post
router.post('/score-post', async (req: Request, res: Response): Promise<void> => {
  const { content, platforms } = req.body as { content?: string; platforms?: string[] }
  if (!content) { sendError(res, 400, 'MISSING_CONTENT', 'content required'); return }
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const platformStr = platforms?.join(', ') ?? 'general social media'
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a social media expert. Score this post for ${platformStr} on a scale of 1-10 across these dimensions. Return ONLY valid JSON, no markdown:

Post: "${content}"

Return this exact JSON structure:
{
  "overall": 7,
  "scores": {
    "hook": 8,
    "readability": 7,
    "cta": 6,
    "hashtags": 7,
    "length": 8,
    "engagement_bait": 5
  },
  "tips": [
    "Start with a stronger hook question",
    "Add a clear call-to-action at the end",
    "Consider adding 3-5 relevant hashtags"
  ],
  "verdict": "Good post with room for improvement. The content is clear but lacks a strong hook."
}`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Post scoring error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Scoring failed')
  }
})

// POST /api/v1/ai/trends
router.post('/trends', async (req: Request, res: Response): Promise<void> => {
  const { niche, platforms } = req.body as { niche?: string; platforms?: string[] }
  if (!niche) { sendError(res, 400, 'MISSING_NICHE', 'niche required'); return }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()
    const platformStr = platforms?.join(', ') ?? 'Instagram, TikTok, X'
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a social media trends analyst. For the "${niche}" niche on ${platformStr}, generate current trending topics and content ideas. Today is ${new Date().toLocaleDateString()}. Return ONLY valid JSON, no markdown:
{
  "trends": [
    {
      "topic": "Topic name",
      "momentum": "rising|hot|stable",
      "description": "Why this is trending and what content to create",
      "contentIdeas": ["Idea 1", "Idea 2", "Idea 3"],
      "suggestedHashtags": ["#tag1", "#tag2", "#tag3"]
    }
  ],
  "summary": "Overall trend summary for this niche this week"
}
Return exactly 6 trends.`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const result = JSON.parse(text)
    res.json(result)
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Trend detection failed')
  }
})

// POST /api/v1/ai/draft-reply
router.post('/draft-reply', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  const { message, platform, tone = 'friendly', brandName } = req.body as { message?: string; platform?: string; tone?: string; brandName?: string }
  if (!message) { sendError(res, 400, 'MISSING_MESSAGE', 'message required'); return }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()
    const message_result = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a social media manager for ${brandName ?? 'a brand'} on ${platform ?? 'social media'}. Draft a ${tone} reply to this comment/message. Keep it concise (under 100 words), authentic, and on-brand. Only return the reply text, nothing else:

"${message}"`,
      }],
    })
    const reply = message_result.content[0].type === 'text' ? message_result.content[0].text : ''
    res.json({ reply })
  } catch {
    sendError(res, 500, 'INTERNAL_ERROR', 'Draft failed')
  }
})

// ─── POST /api/v1/ai/multiply ────────────────────────────────────────────────
// Generate per-platform content variants from a master post using AI.
// Writes into the existing platformVariants structure.
router.post('/multiply', async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI features are not configured on this server')
    return
  }

  const { masterContent, workspaceId } = req.body as { masterContent?: string; workspaceId?: string }

  if (!masterContent?.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'masterContent is required')
    return
  }

  // Plan gate: require PRO or AGENCY
  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (workspace) {
      const limits = PLAN_LIMITS[workspace.plan as Plan]
      if (limits.aiGenerations === 0) {
        sendError(res, 402, 'PLAN_LIMIT', 'AI features require a Pro or Agency plan.')
        return
      }
    }
  }

  // Daily rate limit
  const userId = req.user!.id
  const limitCheck = await checkDailyLimit(userId, 'ai:multiply', env.AI_MULTIPLIER_DAILY_LIMIT)
  if (!limitCheck.allowed) {
    res.status(429).json({
      error: 'DAILY_LIMIT_REACHED',
      message: `You've used all ${env.AI_MULTIPLIER_DAILY_LIMIT} AI multiplications for today. Resets at ${limitCheck.resetAt}.`,
      resetAt: limitCheck.resetAt,
    })
    return
  }

  try {
    // Get brand name for context if workspaceId provided
    let brandName: string | undefined
    if (workspaceId) {
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandName: true } })
      brandName = ws?.brandName ?? undefined
    }

    const variants = await generateVariants(masterContent.trim(), brandName)

    await incrementDailyLimit(userId, 'ai:multiply')
    logger.info({ userId, workspaceId, variantCount: Object.keys(variants).length }, 'Content Multiplier used')

    res.json({ variants })
  } catch (err) {
    logger.error({ err }, 'Content Multiplier error')
    sendError(res, 500, 'MULTIPLY_ERROR', 'Failed to generate variants — please try again')
  }
})

// ─── POST /api/v1/ai/safety-scan ─────────────────────────────────────────────
// Pre-publish advisory safety scan. Returns per-platform status and flags.
// Never blocks publishing — advisory only.
router.post('/safety-scan', async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    // Fail safe: return warning for all platforms without hitting LLM
    const { variants } = req.body as { variants?: Record<string, string> }
    const platforms = Object.keys(variants ?? {})
    res.json({
      results: Object.fromEntries(platforms.map((p) => [p, {
        status: 'warning',
        flags: ['Safety scan unavailable — review manually before publishing'],
      }])),
    })
    return
  }

  const { variants, workspaceId, postId } = req.body as {
    variants?: Record<string, string>
    workspaceId?: string
    postId?: string
  }

  if (!variants || typeof variants !== 'object' || Object.keys(variants).length === 0) {
    sendError(res, 400, 'MISSING_FIELD', 'variants object is required (platform → content map)')
    return
  }

  try {
    const results = await scanContent(variants)
    res.json({ results })
    logger.info({ userId: req.user!.id, platforms: Object.keys(variants) }, 'SafeGuard scan completed')
  } catch (err) {
    logger.error({ err }, 'SafeGuard scan error')
    // Fail safe: return warning, never clear
    res.json({
      results: Object.fromEntries(
        Object.keys(variants).map((p) => [p, {
          status: 'warning',
          flags: ['Safety scan encountered an error — review manually before publishing'],
        }])
      ),
    })
  }
})

// ─── POST /api/v1/ai/safety-scan/override ────────────────────────────────────
// Audit log when user publishes despite a 'risk' SafeGuard result.
router.post('/safety-scan/override', async (req: Request, res: Response): Promise<void> => {
  const { postId, workspaceId, flags, platforms } = req.body as {
    postId?: string
    workspaceId?: string
    flags?: Record<string, string[]>
    platforms?: string[]
  }

  logger.warn({
    userId: req.user!.id,
    postId,
    workspaceId,
    flags,
    platforms,
    overriddenAt: new Date().toISOString(),
  }, 'SafeGuard RISK override: user published despite risk flags')

  if (workspaceId) {
    await logActivity({
      workspaceId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'safeguard_risk_override',
      targetId: postId ?? 'unknown',
      targetType: 'ScheduledPost',
      details: JSON.stringify({ flags, platforms }),
    }).catch(() => {/* non-critical */})
  }

  res.json({ logged: true })
})

// ─── POST /api/v1/ai/caption-suggestion ──────────────────────────────────────
// Generate a caption from a product image URL.
// The image must already be uploaded and have a publicly accessible URL.
router.post('/caption-suggestion', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI features are not configured on this server')
    return
  }

  const { imageUrl, workspaceId } = req.body as { imageUrl?: string; workspaceId?: string }

  if (!imageUrl?.trim()) {
    sendError(res, 400, 'MISSING_FIELD', 'imageUrl is required')
    return
  }

  // Basic URL validation — must be http/https
  try {
    const parsed = new URL(imageUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Bad protocol')
  } catch {
    sendError(res, 400, 'INVALID_URL', 'imageUrl must be a valid http/https URL')
    return
  }

  // Plan gate
  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (workspace) {
      const limits = PLAN_LIMITS[workspace.plan as Plan]
      if (limits.aiGenerations === 0) {
        sendError(res, 402, 'PLAN_LIMIT', 'AI features require a Pro or Agency plan.')
        return
      }
    }
  }

  // Daily rate limit
  const userId = req.user!.id
  const limitCheck = await checkDailyLimit(userId, 'ai:vision', env.AI_VISION_DAILY_LIMIT)
  if (!limitCheck.allowed) {
    res.status(429).json({
      error: 'DAILY_LIMIT_REACHED',
      message: `You've used all ${env.AI_VISION_DAILY_LIMIT} AI caption generations for today. Resets at ${limitCheck.resetAt}.`,
      resetAt: limitCheck.resetAt,
    })
    return
  }

  try {
    let brandName: string | undefined
    if (workspaceId) {
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { brandName: true } })
      brandName = ws?.brandName ?? undefined
    }

    const suggestedCaption = await generateCaption(imageUrl.trim(), brandName)

    await incrementDailyLimit(userId, 'ai:vision')
    logger.info({ userId, workspaceId }, 'Visual caption generated')

    res.json({ suggestedCaption })
  } catch (err) {
    logger.error({ err }, 'Caption suggestion error')
    sendError(res, 500, 'CAPTION_ERROR', 'Failed to generate caption — please try again')
  }
})

// ─── POST /api/v1/ai/repurpose ───────────────────────────────────────────────
router.post('/repurpose', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }

  const { workspaceId, postId, targetFormat } = req.body as {
    workspaceId?: string
    postId?: string
    targetFormat?: string
  }

  if (!postId?.trim()) { sendError(res, 400, 'MISSING_FIELD', 'postId is required'); return }

  const validFormats = ['x-thread', 'linkedin-carousel', 'tweet-drafts', 'instagram-caption']
  if (!targetFormat || !validFormats.includes(targetFormat)) {
    sendError(res, 400, 'INVALID_FORMAT', `targetFormat must be one of: ${validFormats.join(', ')}`)
    return
  }

  const post = await prisma.scheduledPost.findUnique({ where: { id: postId }, include: { metrics: true } })
  if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

  const promptMap: Record<string, string> = {
    'x-thread': 'Convert this post into a 5-tweet X thread. Each tweet max 280 chars. Return JSON array of strings.',
    'linkedin-carousel': 'Convert this into 6 LinkedIn carousel slide texts. Slide 1 = hook, slides 2-5 = key points, slide 6 = CTA. Return JSON array of strings.',
    'tweet-drafts': 'Create 3 different tweet versions of this content, each under 280 chars with different angles. Return JSON array of strings.',
    'instagram-caption': 'Rewrite this as an engaging Instagram caption with relevant emojis and 5-10 hashtags. Return a single string.',
  }

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `${promptMap[targetFormat]}\n\nPost content:\n${post.content}`,
      }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''

    let slides: string[]
    if (targetFormat === 'instagram-caption') {
      slides = [raw.trim()]
    } else {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        slides = JSON.parse(jsonMatch[0]) as string[]
      } else {
        slides = raw.split('\n').map((s) => s.trim()).filter(Boolean)
      }
    }

    res.json({
      format: targetFormat,
      slides,
      sourcePost: { id: post.id, content: post.content.slice(0, 100) },
    })
    logger.info({ userId: req.user!.id, postId, targetFormat }, 'Post repurposed')
  } catch (err) {
    logger.error({ err }, 'Repurpose error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to repurpose post')
  }
})

// ─── GET /api/v1/ai/repurpose/suggestions ────────────────────────────────────
router.get('/repurpose/suggestions', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, limit = '10' } = req.query as { workspaceId?: string; limit?: string }

  const take = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50)
  const since = new Date()
  since.setDate(since.getDate() - 90)

  const posts = await prisma.scheduledPost.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      status: 'PUBLISHED',
      scheduledFor: { gte: since },
    },
    include: { metrics: true },
    orderBy: { scheduledFor: 'desc' },
    take: take * 3,
  })

  const ranked = posts
    .map((p) => {
      const totalEngagement = (p.metrics ?? []).reduce(
        (sum, m) => sum + (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0),
        0,
      )
      const suggestedFormats: string[] = ['tweet-drafts', 'instagram-caption']
      if (p.content.length > 500) {
        suggestedFormats.unshift('x-thread', 'linkedin-carousel')
      }
      return {
        id: p.id,
        content: p.content.slice(0, 120),
        platforms: p.platforms,
        scheduledFor: p.scheduledFor,
        totalEngagement,
        suggestedFormats,
      }
    })
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, take)

  res.json({ posts: ranked })
})

// POST /api/v1/ai/coach — conversational post rewriting
router.post('/coach', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  const { content, instruction, platform } = req.body as {
    content?: string
    instruction?: string
    platform?: string
  }
  if (!content?.trim()) { sendError(res, 400, 'MISSING_CONTENT', 'content required'); return }
  if (!instruction?.trim()) { sendError(res, 400, 'MISSING_INSTRUCTION', 'instruction required'); return }

  const platformContext = platform ? `This post is for ${platform}. ` : ''
  const charLimit = platform === 'X' ? 280 : platform === 'INSTAGRAM' ? 2200 : 3000

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a professional social media copywriter. ${platformContext}

CURRENT POST:
${content}

INSTRUCTION: ${instruction}

Rewrite the post following the instruction exactly. Return ONLY the improved post text — no labels, no explanations, no preamble. Keep it under ${charLimit} characters.`,
      }],
    })
    const improved = response.content[0].type === 'text' ? response.content[0].text.trim() : content
    res.json({ improved, original: content })
  } catch (err) {
    logger.error({ err }, 'AI coach error')
    sendError(res, 500, 'AI_ERROR', 'AI coach failed')
  }
})

// ─── GET /api/v1/ai/brand-voice ──────────────────────────────────────────────
// Analyze past published posts to build a voice profile.
router.get('/brand-voice', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required')
    return
  }

  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: 'PUBLISHED' },
      orderBy: { scheduledFor: 'desc' },
      take: 30,
      select: { content: true },
    })

    if (posts.length < 5) {
      res.json({ ready: false, message: 'Publish at least 5 posts to build your brand voice.' })
      return
    }

    const contents = posts.map((p) => p.content ?? '')

    // Avg character count
    const avgLength = Math.round(contents.reduce((sum, c) => sum + c.length, 0) / contents.length)

    // Emoji detection
    const emojiRegex = /\p{Emoji_Presentation}/u
    const emojiCount = contents.filter((c) => emojiRegex.test(c)).length
    const usesEmoji = emojiCount / contents.length > 0.3

    // Hashtag detection
    const hashtagCount = contents.filter((c) => /#\w/.test(c)).length
    const usesHashtags = hashtagCount / contents.length > 0.5

    // Tone heuristics based on avg sentence length and punctuation
    const avgSentenceLen = contents.reduce((sum, c) => {
      const sentences = c.split(/[.!?]+/).filter(Boolean)
      return sum + (sentences.length > 0 ? c.length / sentences.length : c.length)
    }, 0) / contents.length

    const exclamationRate = contents.filter((c) => c.includes('!')).length / contents.length
    const questionRate = contents.filter((c) => c.includes('?')).length / contents.length

    let tone: 'casual' | 'professional' | 'playful' | 'inspirational'
    if (avgSentenceLen < 40 && exclamationRate > 0.4) {
      tone = 'playful'
    } else if (avgSentenceLen > 80 && exclamationRate < 0.2) {
      tone = 'professional'
    } else if (questionRate > 0.3 || contents.some((c) => /\b(you can|believe|dream|possible)\b/i.test(c))) {
      tone = 'inspirational'
    } else {
      tone = 'casual'
    }

    // Common 2-word phrases (frequency count)
    const phraseFreq: Record<string, number> = {}
    for (const c of contents) {
      const words = c.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`
        phraseFreq[phrase] = (phraseFreq[phrase] ?? 0) + 1
      }
    }
    const commonPhrases = Object.entries(phraseFreq)
      .filter(([, count]) => count > 1)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([phrase]) => phrase)

    const samplePosts = contents.slice(0, 3).map((c) => c.slice(0, 100))

    res.json({
      ready: true,
      profile: { tone, avgLength, usesEmoji, usesHashtags, commonPhrases, samplePosts },
    })

    logger.info({ userId: req.user!.id, workspaceId, postCount: posts.length }, 'Brand voice profile built')
  } catch (err) {
    logger.error({ err }, 'Brand voice profile error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to build brand voice profile')
  }
})

// ─── POST /api/v1/ai/brand-voice/generate ────────────────────────────────────
// Generate captions that match the workspace's brand voice.
router.post('/brand-voice/generate', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    sendError(res, 503, 'AI_UNAVAILABLE', 'AI generation is not configured on this server')
    return
  }

  const { workspaceId, topic, platform, count = 3 } = req.body as {
    workspaceId?: string
    topic?: string
    platform?: string
    count?: number
  }

  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  if (!topic?.trim()) { sendError(res, 400, 'MISSING_FIELD', 'topic is required'); return }
  if (!platform?.trim()) { sendError(res, 400, 'MISSING_FIELD', 'platform is required'); return }

  const numCaptions = Math.min(Math.max(1, count), 5)

  try {
    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId, status: 'PUBLISHED' },
      orderBy: { scheduledFor: 'desc' },
      take: 20,
      select: { content: true },
    })

    const examples = posts.slice(0, 5).map((p, i) => `Example ${i + 1}:\n${p.content ?? ''}`).join('\n\n')

    const userPrompt = `Here are my last 5 social media posts — study the writing style carefully:

${examples}

Now generate exactly ${numCaptions} new captions about the topic: "${topic.trim()}" for ${platform}.

Match my exact style: the tone, emoji usage, sentence length, phrasing, and energy from those examples.

Return ONLY a JSON array of strings. No markdown, no labels, no explanations. Example format: ["caption 1", "caption 2", "caption 3"]`

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '[]'

    let captions: string[]
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      captions = jsonMatch ? JSON.parse(jsonMatch[0]) as string[] : raw.split('\n').filter(Boolean)
    } catch {
      captions = raw.split('\n').filter(Boolean)
    }

    res.json({ captions })
    logger.info({ userId: req.user!.id, workspaceId, topic, platform, count: numCaptions }, 'Brand voice captions generated')
  } catch (err) {
    logger.error({ err }, 'Brand voice generation error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate captions')
  }
})

// ─── POST /api/v1/ai/score ───────────────────────────────────────────────────
// Algorithmic (no LLM) real-time content scorer. Returns 1-100 score instantly.
function scorePost(content: string, platform: string): {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  breakdown: { label: string; score: number; max: number; tip: string }[]
} {
  const p = platform.toUpperCase()

  // 1. Length (25 pts)
  const len = content.length
  let lengthScore = 5
  if (p === 'INSTAGRAM') {
    if (len >= 138 && len <= 150) lengthScore = 25
    else if (len >= 100 && len <= 200) lengthScore = 20
    else if (len >= 50 && len <= 300) lengthScore = 15
  } else if (p === 'X') {
    if (len >= 71 && len <= 100) lengthScore = 25
    else if (len >= 50 && len <= 140) lengthScore = 20
    else lengthScore = 10
  } else if (p === 'LINKEDIN') {
    if (len >= 150 && len <= 300) lengthScore = 25
    else if (len >= 100 && len <= 500) lengthScore = 20
    else lengthScore = 10
  } else if (p === 'FACEBOOK') {
    if (len >= 40 && len <= 80) lengthScore = 25
    else if (len >= 20 && len <= 200) lengthScore = 20
    else lengthScore = 10
  } else if (p === 'TIKTOK') {
    if (len >= 100 && len <= 150) lengthScore = 25
    else if (len >= 50 && len <= 300) lengthScore = 20
    else lengthScore = 10
  }

  // 2. Has CTA (20 pts)
  const hasCta = /comment|share|follow|click|link in bio|check out|learn more|sign up|subscribe|tag|save|repost/i.test(content)
  const ctaScore = hasCta ? 20 : 0

  // 3. Readability (20 pts)
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const avgWords = content.split(' ').length / Math.max(sentences.length, 1)
  let readabilityScore: number
  if (avgWords <= 15) readabilityScore = 20
  else if (avgWords <= 20) readabilityScore = 15
  else if (avgWords <= 25) readabilityScore = 10
  else readabilityScore = 5

  // 4. Hashtags (15 pts)
  const hashtags = (content.match(/#\w+/g) ?? []).length
  let hashtagScore = 5
  if (p === 'INSTAGRAM') {
    if (hashtags >= 5 && hashtags <= 15) hashtagScore = 15
    else if (hashtags >= 1 && hashtags <= 4) hashtagScore = 10
    else if (hashtags === 0) hashtagScore = 0
    else hashtagScore = 5 // >15
  } else if (p === 'X') {
    if (hashtags >= 1 && hashtags <= 2) hashtagScore = 15
    else if (hashtags === 0) hashtagScore = 5
    else hashtagScore = 8 // >2
  } else if (p === 'LINKEDIN') {
    if (hashtags >= 3 && hashtags <= 5) hashtagScore = 15
    else if (hashtags >= 1 && hashtags <= 2) hashtagScore = 10
    else if (hashtags === 0) hashtagScore = 5
  } else {
    if (hashtags >= 1 && hashtags <= 5) hashtagScore = 15
    else if (hashtags === 0) hashtagScore = 5
  }

  // 5. Emoji presence (10 pts)
  const emojiCount = (content.match(/\p{Emoji}/gu) ?? []).length
  const emojiScore = emojiCount > 0 ? 10 : 3

  // 6. Question hook (10 pts)
  const questionScore = /\?/.test(content) ? 10 : 0

  const score = Math.min(100, lengthScore + ctaScore + readabilityScore + hashtagScore + emojiScore + questionScore)

  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  if (score >= 90) grade = 'A'
  else if (score >= 75) grade = 'B'
  else if (score >= 60) grade = 'C'
  else if (score >= 45) grade = 'D'
  else grade = 'F'

  const breakdown = [
    {
      label: 'Length',
      score: lengthScore,
      max: 25,
      tip: `Aim for the optimal length for ${p}. Current: ${len} chars.`,
    },
    {
      label: 'Call to Action',
      score: ctaScore,
      max: 20,
      tip: 'Add a CTA like "comment below", "share this", "click the link in bio", or "sign up".',
    },
    {
      label: 'Readability',
      score: readabilityScore,
      max: 20,
      tip: 'Keep sentences short — aim for under 15 words per sentence for best engagement.',
    },
    {
      label: 'Hashtags',
      score: hashtagScore,
      max: 15,
      tip: p === 'INSTAGRAM' ? 'Use 5-15 hashtags for best reach on Instagram.'
        : p === 'X' ? 'Use 1-2 hashtags on X — more reduces engagement.'
        : p === 'LINKEDIN' ? 'Use 3-5 hashtags on LinkedIn.'
        : 'Add 1-5 relevant hashtags.',
    },
    {
      label: 'Emojis',
      score: emojiScore,
      max: 10,
      tip: 'Add at least one emoji to boost visual appeal and engagement.',
    },
    {
      label: 'Question Hook',
      score: questionScore,
      max: 10,
      tip: 'Ask a question to spark comments and conversation.',
    },
  ]

  return { score, grade, breakdown }
}

router.post('/score', aiLimiter, async (req: Request, res: Response): Promise<void> => {
  const { content, platform, workspaceId } = req.body as { content?: string; platform?: string; workspaceId?: string }
  if (!content?.trim()) { sendError(res, 400, 'MISSING_CONTENT', 'content is required'); return }
  if (!platform?.trim()) { sendError(res, 400, 'MISSING_PLATFORM', 'platform is required'); return }
  const result = scorePost(content, platform)
  res.json({ ...result, platform: platform.toUpperCase() })
})

export default router
