import { z } from 'zod'

export const GuardrailsResultSchema = z.object({
  hasFaces: z.boolean(),
  hasHouseNumber: z.boolean(),
  hasLicensePlate: z.boolean(),
  hasCustomerName: z.boolean(),  // in any visible text
  flagged: z.boolean(),
  flagReasons: z.array(z.string()),
})

export type GuardrailsResult = z.infer<typeof GuardrailsResultSchema>
