import Anthropic from '@anthropic-ai/sdk'
import { GuardrailsResultSchema, type GuardrailsResult } from './guardrailsSchema.js'
import { PostVariantsResponseSchema, type PostVariant } from './postVariantSchema.js'

const GUARDRAILS_SYSTEM_PROMPT =
  'You are a content safety checker for a social media management tool used by home service contractors. ' +
  'Analyze this image and respond ONLY with valid JSON matching this schema: ' +
  '{ hasFaces: boolean, hasHouseNumber: boolean, hasLicensePlate: boolean, hasCustomerName: boolean, flagged: boolean, flagReasons: string[] }. ' +
  'Set flagged=true if any of the boolean fields are true.'

export async function checkPhotoGuardrails(
  photoUrl: string,
  anthropicApiKey: string,
): Promise<GuardrailsResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const client = new Anthropic({ apiKey: anthropicApiKey })
    const response = await client.messages.create(
      {
        model: 'claude-haiku-20250307',
        max_tokens: 512,
        system: GUARDRAILS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: photoUrl },
              },
              { type: 'text', text: 'Analyze this image for content safety.' },
            ],
          },
        ],
      },
      { signal: controller.signal },
    )

    const text = response.content.find((c) => c.type === 'text')?.text ?? ''
    // Extract JSON from the response (model may wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { flagged: true, flagReasons: ['guardrails_parse_failed'], hasFaces: false, hasHouseNumber: false, hasLicensePlate: false, hasCustomerName: false }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return { flagged: true, flagReasons: ['guardrails_parse_failed'], hasFaces: false, hasHouseNumber: false, hasLicensePlate: false, hasCustomerName: false }
    }

    const result = GuardrailsResultSchema.safeParse(parsed)
    if (!result.success) {
      return { flagged: true, flagReasons: ['guardrails_parse_failed'], hasFaces: false, hasHouseNumber: false, hasLicensePlate: false, hasCustomerName: false }
    }
    return result.data
  } catch {
    return { flagged: true, flagReasons: ['guardrails_request_failed'], hasFaces: false, hasHouseNumber: false, hasLicensePlate: false, hasCustomerName: false }
  } finally {
    clearTimeout(timeout)
  }
}

export async function generatePostVariants(params: {
  photoUrl: string
  workspaceId: string
  brandName: string | null
  platforms: string[]
  jobContext?: { city?: string; jobType?: string }
  anthropicApiKey: string
}): Promise<{ success: boolean; variants?: PostVariant[]; reason?: string }> {
  const { photoUrl, brandName, platforms, jobContext, anthropicApiKey } = params
  const client = new Anthropic({ apiKey: anthropicApiKey })

  const platformList = platforms.length > 0 ? platforms.join(', ') : 'FACEBOOK, INSTAGRAM'
  const N = Math.min(platforms.length || 2, 6)
  const city = jobContext?.city ?? 'your area'
  const jobType = jobContext?.jobType ?? 'home service'
  const brand = brandName ?? 'our business'

  const buildPrompt = (strict: boolean) =>
    `Generate ${N} social media post variants for this job photo. The contractor's business is ${brand} in ${city}. Job type: ${jobType}. ` +
    `Create variants for these platforms: ${platformList}. ` +
    (strict
      ? 'STRICT MODE: You MUST respond with ONLY valid JSON, no markdown, no extra text. '
      : '') +
    'IMPORTANT: Do NOT include customer names, street addresses, license plates, or any PII. ' +
    'Respond ONLY with valid JSON: { "variants": [{ "platform": string, "caption": string, "hashtags": string[], "suggestedScheduleOffset": number }] }. ' +
    'platform must be one of: FACEBOOK, INSTAGRAM, TIKTOK, X, LINKEDIN, GOOGLE. ' +
    'hashtags must each start with #. suggestedScheduleOffset is hours from now (0-72).'

  const runGeneration = async (strict: boolean): Promise<string> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await client.messages.create(
        {
          model: 'claude-haiku-20250307',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'url', url: photoUrl },
                },
                { type: 'text', text: buildPrompt(strict) },
              ],
            },
          ],
        },
        { signal: controller.signal },
      )
      return response.content.find((c) => c.type === 'text')?.text ?? ''
    } finally {
      clearTimeout(timeout)
    }
  }

  const parseVariants = (text: string) => {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    try {
      const parsed = JSON.parse(jsonMatch[0])
      const result = PostVariantsResponseSchema.safeParse(parsed)
      return result.success ? result.data.variants : null
    } catch {
      return null
    }
  }

  try {
    const firstText = await runGeneration(false)
    const firstVariants = parseVariants(firstText)
    if (firstVariants) return { success: true, variants: firstVariants }

    // Retry once with stricter prompt
    const secondText = await runGeneration(true)
    const secondVariants = parseVariants(secondText)
    if (secondVariants) return { success: true, variants: secondVariants }

    return { success: false, reason: 'ai_parse_failed' }
  } catch {
    return { success: false, reason: 'ai_request_failed' }
  }
}

export async function saveVariantsAsDrafts(params: {
  variants: PostVariant[]
  photoUrl: string
  workspaceId: string
  prismaClient: any
}): Promise<string[]> {
  const { variants, photoUrl, workspaceId, prismaClient } = params
  const createdIds: string[] = []

  for (const variant of variants) {
    const scheduledFor = new Date(Date.now() + variant.suggestedScheduleOffset * 3_600_000)
    const post = await prismaClient.scheduledPost.create({
      data: {
        workspaceId,
        content: variant.caption,
        platforms: [variant.platform],
        mediaUrls: [photoUrl],
        scheduledFor,
        status: 'DRAFT',
      },
    })
    createdIds.push(post.id)
  }

  return createdIds
}
