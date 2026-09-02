/**
 * Automation Engine — Zod schemas (single source of truth).
 * TypeScript types are derived via z.infer — never written by hand.
 *
 * Zod v4 is installed (^4.4.3). All schemas parse or throw ZodError.
 */

import { z } from 'zod'

// ── Channels ──────────────────────────────────────────────────────────────────

export const AutomationChannelSchema = z.enum([
  'INSTAGRAM',
  'FACEBOOK',
  'WHATSAPP',
  'STUB',
])
export type AutomationChannel = z.infer<typeof AutomationChannelSchema>

// ── Trigger configs ───────────────────────────────────────────────────────────

export const KeywordTriggerConfigSchema = z.object({
  type: z.literal('KEYWORD'),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(50),
  matchMode: z.enum(['EXACT', 'CONTAINS', 'STARTS_WITH']).default('EXACT'),
  channel: AutomationChannelSchema.optional(),
})

export const FirstContactTriggerConfigSchema = z.object({
  type: z.literal('FIRST_CONTACT'),
  channel: AutomationChannelSchema.optional(),
})

export const AnyMessageTriggerConfigSchema = z.object({
  type: z.literal('ANY_MESSAGE'),
  channel: AutomationChannelSchema.optional(),
})

export const WebhookEventTriggerConfigSchema = z.object({
  type: z.literal('WEBHOOK_EVENT'),
  eventType: z.string().min(1).max(128),
  channel: AutomationChannelSchema.optional(),
})

export const TriggerConfigSchema = z.discriminatedUnion('type', [
  KeywordTriggerConfigSchema,
  FirstContactTriggerConfigSchema,
  AnyMessageTriggerConfigSchema,
  WebhookEventTriggerConfigSchema,
])
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>

// ── Template variable paths ───────────────────────────────────────────────────
// Allowed: {{contact.firstName}}, {{contact.fields.<key>}}, {{ctx.<key>}}, {{event.text}}
// Any other path is a validation error at publish and renders empty at runtime.

export const ALLOWED_TEMPLATE_PATHS = /^\{\{(contact\.firstName|contact\.fields\.[a-zA-Z][a-zA-Z0-9_]{0,63}|ctx\.[a-zA-Z][a-zA-Z0-9_]{0,63}|event\.text)\}\}/g

export function extractTemplatePaths(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? []
  return matches.map((m) => m.slice(2, -2).trim())
}

const VALID_PATH = /^(contact\.firstName|contact\.fields\.[a-zA-Z][a-zA-Z0-9_]{0,63}|ctx\.[a-zA-Z][a-zA-Z0-9_]{0,63}|event\.text)$/

export function validateTemplatePaths(text: string): string[] {
  const paths = extractTemplatePaths(text)
  return paths.filter((p) => !VALID_PATH.test(p))
}

// ── Quick reply ───────────────────────────────────────────────────────────────

export const QuickReplySchema = z.object({
  label: z.string().min(1).max(20),
  value: z.string().min(1).max(256),
})

// ── Node configs ──────────────────────────────────────────────────────────────

export const MessageNodeConfigSchema = z.object({
  nodeType: z.literal('MESSAGE'),
  text: z.string().min(1).max(4096),
  quickReplies: z.array(QuickReplySchema).max(13).optional(),
  typingDelayMs: z.number().int().min(0).max(5000).optional(),
})

// Condition expression — recursive via z.lazy
// Operators allowlist: equals, notEquals, contains, startsWith, exists, in,
// hasTag, gt, lt, and, or, not. Max nesting depth 8 enforced at validation time.

const FieldRefSchema = z.object({
  path: z.string().regex(
    /^(contact\.firstName|contact\.fields\.[a-zA-Z][a-zA-Z0-9_]{0,63}|ctx\.[a-zA-Z][a-zA-Z0-9_]{0,63}|event\.text|contact\.channel|contact\.optedOut)$/,
    'Field path not in allowlist',
  ),
})

export type FieldRef = z.infer<typeof FieldRefSchema>

export type ConditionExpr =
  | { op: 'equals';     field: FieldRef; value: string | number | boolean }
  | { op: 'notEquals';  field: FieldRef; value: string | number | boolean }
  | { op: 'contains';   field: FieldRef; value: string }
  | { op: 'startsWith'; field: FieldRef; value: string }
  | { op: 'exists';     field: FieldRef }
  | { op: 'in';         field: FieldRef; values: Array<string | number> }
  | { op: 'hasTag';     tag: string }
  | { op: 'gt';         field: FieldRef; value: number }
  | { op: 'lt';         field: FieldRef; value: number }
  | { op: 'and';        conditions: ConditionExpr[] }
  | { op: 'or';         conditions: ConditionExpr[] }
  | { op: 'not';        condition: ConditionExpr }

export const ConditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal('equals'),     field: FieldRefSchema, value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ op: z.literal('notEquals'),  field: FieldRefSchema, value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ op: z.literal('contains'),   field: FieldRefSchema, value: z.string() }),
    z.object({ op: z.literal('startsWith'), field: FieldRefSchema, value: z.string() }),
    z.object({ op: z.literal('exists'),     field: FieldRefSchema }),
    z.object({ op: z.literal('in'),         field: FieldRefSchema, values: z.array(z.union([z.string(), z.number()])).min(1).max(100) }),
    z.object({ op: z.literal('hasTag'),     tag: z.string().min(1).max(64) }),
    z.object({ op: z.literal('gt'),         field: FieldRefSchema, value: z.number() }),
    z.object({ op: z.literal('lt'),         field: FieldRefSchema, value: z.number() }),
    z.object({ op: z.literal('and'),        conditions: z.array(ConditionExprSchema).min(1).max(50) }),
    z.object({ op: z.literal('or'),         conditions: z.array(ConditionExprSchema).min(1).max(50) }),
    z.object({ op: z.literal('not'),        condition: ConditionExprSchema }),
  ])
)

export const ConditionNodeConfigSchema = z.object({
  nodeType: z.literal('CONDITION'),
  expr: ConditionExprSchema,
})

// Action payloads

const CONTACT_FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/
const CONTACT_FIELD_VALUE_MAX = 1024

export const AddTagActionSchema = z.object({
  action: z.literal('ADD_TAG'),
  tag: z.string().min(1).max(64),
})

export const RemoveTagActionSchema = z.object({
  action: z.literal('REMOVE_TAG'),
  tag: z.string().min(1).max(64),
})

export const SetVariableActionSchema = z.object({
  action: z.literal('SET_VARIABLE'),
  key: z.string().regex(CONTACT_FIELD_KEY, 'Invalid key'),
  value: z.union([z.string().max(CONTACT_FIELD_VALUE_MAX), z.number(), z.boolean(), z.null()]),
})

export const SetContactFieldActionSchema = z.object({
  action: z.literal('SET_CONTACT_FIELD'),
  key: z.string().regex(CONTACT_FIELD_KEY, 'Invalid key'),
  value: z.union([z.string().max(CONTACT_FIELD_VALUE_MAX), z.number(), z.boolean(), z.null()]),
})

export const ActionPayloadSchema = z.discriminatedUnion('action', [
  AddTagActionSchema,
  RemoveTagActionSchema,
  SetVariableActionSchema,
  SetContactFieldActionSchema,
])
export type ActionPayload = z.infer<typeof ActionPayloadSchema>

export const ActionNodeConfigSchema = z.object({
  nodeType: z.literal('ACTION'),
  action: ActionPayloadSchema,
})

// Wait node
export const WaitInputConfigSchema = z.object({
  kind: z.literal('INPUT'),
  timeoutSeconds: z.number().int().min(1).max(604800).optional(), // max 7 days
  acceptedInputs: z.enum(['ANY', 'QUICK_REPLY_ONLY']).default('ANY'),
})

export const WaitDurationConfigSchema = z.object({
  kind: z.literal('DURATION'),
  seconds: z.number().int().min(1).max(604800),
})

export const WaitUntilConfigSchema = z.object({
  kind: z.literal('UNTIL'),
  isoTimestamp: z.string().datetime({ offset: true }),
})

export const WaitNodeConfigSchema = z.object({
  nodeType: z.literal('WAIT'),
  wait: z.discriminatedUnion('kind', [
    WaitInputConfigSchema,
    WaitDurationConfigSchema,
    WaitUntilConfigSchema,
  ]),
})

export const EndNodeConfigSchema = z.object({
  nodeType: z.literal('END'),
  outcome: z.string().max(64).optional(),
})

export const NodeConfigSchema = z.discriminatedUnion('nodeType', [
  MessageNodeConfigSchema,
  ConditionNodeConfigSchema,
  ActionNodeConfigSchema,
  WaitNodeConfigSchema,
  EndNodeConfigSchema,
])
export type NodeConfig = z.infer<typeof NodeConfigSchema>

// ── Edge labels ───────────────────────────────────────────────────────────────

export const EdgeLabelSchema = z.union([
  z.literal('default'),
  z.literal('true'),
  z.literal('false'),
  z.literal('timeout'),
  z.literal('error'),
  z.string().regex(/^choice:.+$/, 'choice edge must be choice:<value>'),
])
export type EdgeLabel = z.infer<typeof EdgeLabelSchema>

// ── Normalized inbound event ──────────────────────────────────────────────────

export const NormalizedInboundEventSchema = z.object({
  workspaceId:           z.string().min(1),
  channel:               AutomationChannelSchema,
  providerEventId:       z.string().optional(),
  idempotencyKey:        z.string().min(1),
  derivedIdempotency:    z.boolean(),
  senderId:              z.string().min(1),
  text:                  z.string().optional(),
  normalizedText:        z.string().optional(),
  quickReplyValue:       z.string().optional(),
  isFirstContact:        z.boolean().default(false),
  webhookEventType:      z.string().optional(),
  rawPayload:            z.record(z.string(), z.unknown()),
  receivedAt:            z.coerce.date(),
})
export type NormalizedInboundEvent = z.infer<typeof NormalizedInboundEventSchema>

// ── Queue job payloads ────────────────────────────────────────────────────────

export const TriggerJobPayloadSchema = z.object({
  eventId:     z.string().min(1),
  workspaceId: z.string().min(1),
  correlationId: z.string().min(1),
})
export type TriggerJobPayload = z.infer<typeof TriggerJobPayloadSchema>

export const ExecuteJobPayloadSchema = z.object({
  instanceId:    z.string().min(1),
  workspaceId:   z.string().min(1),
  inboundEventId: z.string().optional(),
  correlationId: z.string().min(1),
  attempt:       z.number().int().min(1).default(1),
})
export type ExecuteJobPayload = z.infer<typeof ExecuteJobPayloadSchema>

export const OutboxJobPayloadSchema = z.object({
  outboxId:    z.string().min(1),
  workspaceId: z.string().min(1),
  correlationId: z.string().min(1),
})
export type OutboxJobPayload = z.infer<typeof OutboxJobPayloadSchema>

export const ResumeJobPayloadSchema = z.object({
  instanceId:    z.string().min(1),
  workspaceId:   z.string().min(1),
  inboundEventId: z.string().optional(),
  correlationId: z.string().min(1),
})
export type ResumeJobPayload = z.infer<typeof ResumeJobPayloadSchema>

// ── Execution result ──────────────────────────────────────────────────────────

export const ExecutionResultSchema = z.object({
  status: z.enum(['COMPLETED', 'WAITING_FOR_INPUT', 'WAITING_UNTIL', 'FAILED', 'CANCELLED', 'CONTINUATION']),
  nextNodeKey: z.string().optional(),
  wakeAt:      z.coerce.date().optional(),
  reason:      z.string().optional(),
})
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>

// ── Error classification ──────────────────────────────────────────────────────

export class RetryableError extends Error {
  readonly retryable = true as const
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'RetryableError'
  }
}

export class TerminalError extends Error {
  readonly retryable = false as const
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'TerminalError'
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof RetryableError) return true
  if (err instanceof TerminalError) return false
  // Default: network errors, ECONNREFUSED, etc. are retryable
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code
    if (code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return true
  }
  return false
}

// ── Validation result ─────────────────────────────────────────────────────────

export interface ValidationIssue {
  nodeKey?: string
  edgeId?: string
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

// ── Eval context ──────────────────────────────────────────────────────────────

export interface EvalContext {
  contact: {
    firstName?: string
    channel?: string
    optedOut?: boolean
    fields?: Record<string, unknown>
    tags?: string[]
  }
  ctx: Record<string, unknown>
  event: {
    text?: string
    quickReplyValue?: string
  }
}
