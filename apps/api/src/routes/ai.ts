import { Router } from 'express'
import type { Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendError } from '../lib/apiError.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/prisma.js'
import { PLAN_LIMITS } from '../lib/plans.js'
import type { Plan } from '../lib/plans.js'

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
router.post('/translate', async (req: Request, res: Response): Promise<void> => {
  const { text, targetLanguage } = req.body as { text?: string; targetLanguage?: string }
  if (!text || !targetLanguage) { sendError(res, 400, 'MISSING_PARAMS', 'text and targetLanguage required'); return }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
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
      model: 'claude-haiku-4-5',
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
router.post('/draft-reply', async (req: Request, res: Response): Promise<void> => {
  const { message, platform, tone = 'friendly', brandName } = req.body as { message?: string; platform?: string; tone?: string; brandName?: string }
  if (!message) { sendError(res, 400, 'MISSING_MESSAGE', 'message required'); return }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic()
    const message_result = await client.messages.create({
      model: 'claude-haiku-4-5',
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

export default router
