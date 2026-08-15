/**
 * Zod request validation middleware.
 *
 * Usage:
 *   import { validateBody, validateQuery } from '../middleware/validate.js'
 *   import { z } from 'zod'
 *
 *   const CreatePostSchema = z.object({ workspaceId: z.string().cuid(), content: z.string().min(1) })
 *   router.post('/', validateBody(CreatePostSchema), handler)
 *
 * On validation failure sends:
 *   400 { error: 'VALIDATION_ERROR', message: '...', details: [{ path, message }] }
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { z, ZodSchema } from 'zod'
import type { ZodError } from 'zod'

function formatZodError(err: ZodError): Array<{ path: string; message: string }> {
  // Zod v4 uses `.issues`; v3 used `.errors`. Support both.
  const issues = (err as any).issues ?? (err as any).errors ?? []
  return (issues as Array<{ path: unknown[]; message: string }>).map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }))
}

/**
 * Validate req.body against a Zod schema.
 * Replaces req.body with the parsed (coerced + stripped) value on success.
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details: formatZodError(result.error),
      })
      return
    }
    req.body = result.data
    next()
  }
}

/**
 * Validate req.query against a Zod schema.
 * Replaces req.query with the parsed value on success.
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Query parameter validation failed',
        details: formatZodError(result.error),
      })
      return
    }
    // Remove unvalidated params first so downstream handlers can't see them,
    // then set only the schema-validated values.
    for (const key of Object.keys(req.query)) {
      delete (req.query as Record<string, unknown>)[key]
    }
    Object.assign(req.query, result.data)
    next()
  }
}

// ── Shared reusable field schemas ─────────────────────────────────────────────

/** CUID or UUID workspace/resource ID */
export const idField = z.string().min(1, 'ID is required').max(128)

/** Non-empty trimmed string */
export const nonEmptyString = (label = 'Field') =>
  z.string().min(1, `${label} is required`).trim()

/** HTTPS URL (or HTTP in non-production) */
export const urlField = z
  .string()
  .url('Must be a valid URL')
  .refine(
    (u) => u.startsWith('https://') || process.env.NODE_ENV !== 'production',
    'URL must use HTTPS in production',
  )

/** Webhook event names that OmniPulse can emit */
export const WEBHOOK_EVENTS = [
  'post.published',
  'post.failed',
  'post.scheduled',
  'post.approved',
  'post.rejected',
  'post.created',
  'comment.created',
  'inbox.message',
  'webhook.test',
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
export const webhookEventField = z.enum(WEBHOOK_EVENTS)
