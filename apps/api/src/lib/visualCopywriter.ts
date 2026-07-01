import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'
import { logger } from './logger.js'

const MAX_CAPTION_LENGTH = 2200 // Instagram limit as the universal cap

export async function generateCaption(
  imageUrl: string,
  brandName?: string,
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const brandContext = brandName
    ? `You are writing for the brand: ${brandName}.`
    : 'You are writing for a brand on social media.'

  const system = `You are an expert social media copywriter specialising in product photography captions.
${brandContext}

Write a compelling, authentic-sounding social media caption based on the product image provided.

Rules:
1. Return ONLY the caption text — no labels, no explanation, no "Here's your caption:" preamble
2. Keep it under 300 characters (Instagram-ready, adaptable to other platforms)
3. Make it engaging, human, and scroll-stopping
4. Do NOT include hashtags — the user will add those separately
5. Capture what makes the product visually interesting or desirable`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: imageUrl },
        },
        {
          type: 'text',
          text: 'Write a compelling social media caption for this product image.',
        },
      ],
    }],
  })

  const text = response.content.find((b) => b.type === 'text')?.text?.trim() ?? ''

  if (!text) throw new Error('Empty caption returned by model')

  // Server-side enforce max length
  const caption = text.length > MAX_CAPTION_LENGTH ? text.slice(0, MAX_CAPTION_LENGTH) : text

  logger.info({ imageUrl: imageUrl.slice(0, 80), captionLength: caption.length }, 'Visual caption generated')
  return caption
}
