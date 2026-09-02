/**
 * MESSAGE node executor.
 *
 * Writes a row to AutomationOutbox (at-most-once via idempotencyKey).
 * The actual channel delivery is handled by the outbox worker (Phase 4).
 *
 * Template variables in `text` are resolved against the EvalContext at
 * execution time so the outbox stores the final rendered string.
 */

import type { NodeExecutionContext, NodeExecutionResult } from './types.js'
import { TerminalError } from '../../types/index.js'

/** Render {{path}} template variables from the EvalContext. */
function renderTemplate(text: string, ctx: NodeExecutionContext['evalCtx']): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawPath) => {
    const path = rawPath.trim()
    if (path === 'contact.firstName') return String(ctx.contact.firstName ?? '')
    if (path === 'event.text')        return String(ctx.event.text ?? '')
    if (path.startsWith('contact.fields.')) {
      const key = path.slice('contact.fields.'.length)
      return String(ctx.contact.fields?.[key] ?? '')
    }
    if (path.startsWith('ctx.')) {
      const key = path.slice('ctx.'.length)
      return String(ctx.ctx[key] ?? '')
    }
    return ''
  })
}

export async function executeMessageNode(nodeCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { prisma, instance, config, evalCtx, idempotencyKey } = nodeCtx

  if (config.nodeType !== 'MESSAGE') throw new TerminalError('messageExecutor called on non-MESSAGE node')

  const renderedText = renderTemplate(config.text, evalCtx)

  // Write to outbox — idempotent via unique idempotencyKey
  await prisma.automationOutbox.upsert({
    where:  { idempotencyKey },
    create: {
      workspaceId:    instance.workspaceId,
      instanceId:     instance.id,
      type:           'SEND_MESSAGE',
      idempotencyKey,
      payload: {
        contactId:    instance.contactId,
        text:         renderedText,
        quickReplies: config.quickReplies ?? [],
        typingDelayMs: config.typingDelayMs ?? 0,
      },
    },
    update: {}, // already written — no-op
  })

  // Follow the 'default' edge (MESSAGE nodes always have one outgoing edge)
  return { nextEdgeLabel: 'default' }
}
