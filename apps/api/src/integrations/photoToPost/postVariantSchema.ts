import { z } from 'zod'

export const PostVariantSchema = z.object({
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'LINKEDIN', 'GOOGLE']),
  caption: z.string().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#\w+$/)).max(30),
  suggestedScheduleOffset: z.number().int().min(0).max(72), // hours from now
})

export const PostVariantsResponseSchema = z.object({
  variants: z.array(PostVariantSchema).min(1).max(6),
})

export type PostVariant = z.infer<typeof PostVariantSchema>
export type PostVariantsResponse = z.infer<typeof PostVariantsResponseSchema>
