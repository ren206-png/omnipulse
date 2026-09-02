/**
 * Automation Engine — Condition Evaluator
 *
 * Pure function over a frozen EvalContext. No eval, no new Function, no
 * user-supplied regex, no SQL. Operators are an explicit allowlist.
 * Max nesting depth 8 — enforced here at runtime (also caught by validator).
 */

import type { ConditionExpr, EvalContext, FieldRef } from '../types/index.js'

const MAX_DEPTH = 8

/** NFKC normalizer used for keyword matching and string comparisons */
export function normalizeText(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Resolve a FieldRef path against the eval context */
function resolve(ref: FieldRef, ctx: EvalContext): unknown {
  const { path } = ref
  if (path === 'contact.firstName') return ctx.contact.firstName
  if (path === 'contact.channel')   return ctx.contact.channel
  if (path === 'contact.optedOut')  return ctx.contact.optedOut
  if (path === 'event.text')        return ctx.event.text
  if (path.startsWith('contact.fields.')) {
    const key = path.slice('contact.fields.'.length)
    return ctx.contact.fields?.[key]
  }
  if (path.startsWith('ctx.')) {
    const key = path.slice('ctx.'.length)
    return ctx.ctx[key]
  }
  return undefined
}

/** Cast value to string for comparison — undefined → '' */
function asString(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v)
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

/**
 * Evaluate a ConditionExpr against the provided context.
 * @throws {Error} if depth limit is exceeded (TerminalError in callers)
 */
export function evaluateCondition(
  expr: ConditionExpr,
  ctx: EvalContext,
  depth = 0,
): boolean {
  if (depth > MAX_DEPTH) {
    throw new Error(`Condition nesting depth exceeds maximum of ${MAX_DEPTH}`)
  }

  switch (expr.op) {
    case 'equals': {
      const resolved = resolve(expr.field, ctx)
      if (typeof expr.value === 'string') {
        return normalizeText(asString(resolved)) === normalizeText(String(expr.value))
      }
      return resolved === expr.value
    }

    case 'notEquals': {
      const resolved = resolve(expr.field, ctx)
      if (typeof expr.value === 'string') {
        return normalizeText(asString(resolved)) !== normalizeText(String(expr.value))
      }
      return resolved !== expr.value
    }

    case 'contains': {
      const resolved = normalizeText(asString(resolve(expr.field, ctx)))
      return resolved.includes(normalizeText(expr.value))
    }

    case 'startsWith': {
      const resolved = normalizeText(asString(resolve(expr.field, ctx)))
      return resolved.startsWith(normalizeText(expr.value))
    }

    case 'exists': {
      const resolved = resolve(expr.field, ctx)
      return resolved !== undefined && resolved !== null && resolved !== ''
    }

    case 'in': {
      const resolved = resolve(expr.field, ctx)
      return expr.values.some((v) => {
        if (typeof v === 'string') {
          return normalizeText(asString(resolved)) === normalizeText(v)
        }
        return resolved === v
      })
    }

    case 'hasTag': {
      const tags = ctx.contact.tags ?? []
      const needle = normalizeText(expr.tag)
      return tags.some((t) => normalizeText(t) === needle)
    }

    case 'gt': {
      const n = asNumber(resolve(expr.field, ctx))
      return n !== undefined && n > expr.value
    }

    case 'lt': {
      const n = asNumber(resolve(expr.field, ctx))
      return n !== undefined && n < expr.value
    }

    case 'and': {
      return expr.conditions.every((c) => evaluateCondition(c, ctx, depth + 1))
    }

    case 'or': {
      return expr.conditions.some((c) => evaluateCondition(c, ctx, depth + 1))
    }

    case 'not': {
      return !evaluateCondition(expr.condition, ctx, depth + 1)
    }

    default: {
      // TypeScript exhaustiveness: this path is unreachable if ConditionExpr is correct.
      const _never: never = expr
      throw new Error(`Unknown condition operator: ${(_never as { op: string }).op}`)
    }
  }
}

/**
 * Check maximum nesting depth without evaluating.
 * Returns the maximum observed depth; throws if > MAX_DEPTH.
 */
export function checkConditionDepth(expr: ConditionExpr, depth = 0): number {
  if (depth > MAX_DEPTH) {
    throw new Error(`Condition nesting depth exceeds maximum of ${MAX_DEPTH}`)
  }
  switch (expr.op) {
    case 'and':
    case 'or':
      return Math.max(...expr.conditions.map((c) => checkConditionDepth(c, depth + 1)))
    case 'not':
      return checkConditionDepth(expr.condition, depth + 1)
    default:
      return depth
  }
}
