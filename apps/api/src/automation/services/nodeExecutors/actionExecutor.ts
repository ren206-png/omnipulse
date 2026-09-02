/**
 * ACTION node executor.
 *
 * Applies a single action payload to the contact / context in the database.
 * All mutations are idempotent-safe: re-running the same node execution
 * produces the same final DB state.
 *
 * Supported actions (mirrors ActionPayloadSchema):
 *   ADD_TAG           → AutomationContact.tags (append if not present)
 *   REMOVE_TAG        → AutomationContact.tags (remove if present)
 *   SET_VARIABLE      → ContactFlowInstance.context (merged JSON)
 *   SET_CONTACT_FIELD → AutomationContact.automationFields (merged JSON)
 */

import type { NodeExecutionContext, NodeExecutionResult } from './types.js'
import { TerminalError } from '../../types/index.js'
import { normalizeText } from '../conditionEvaluator.js'

export async function executeActionNode(nodeCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { prisma, instance, config } = nodeCtx

  if (config.nodeType !== 'ACTION') throw new TerminalError('actionExecutor called on non-ACTION node')

  const action = config.action

  switch (action.action) {
    case 'ADD_TAG': {
      // Read current tags, append if not present (NFKC-normalised dedup)
      const contact = await prisma.automationContact.findUnique({
        where:  { id: instance.contactId },
        select: { automationFields: true },
      })
      const currentFields = (contact?.automationFields ?? {}) as Record<string, unknown>
      const tags: string[] = Array.isArray(currentFields._tags) ? (currentFields._tags as string[]) : []
      const normNew = normalizeText(action.tag)
      if (!tags.some((t) => normalizeText(t) === normNew)) {
        tags.push(action.tag)
      }
      await prisma.automationContact.update({
        where: { id: instance.contactId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { automationFields: { ...currentFields, _tags: tags } as any },
      })
      break
    }

    case 'REMOVE_TAG': {
      const contact = await prisma.automationContact.findUnique({
        where:  { id: instance.contactId },
        select: { automationFields: true },
      })
      const currentFields = (contact?.automationFields ?? {}) as Record<string, unknown>
      const tags: string[] = Array.isArray(currentFields._tags) ? (currentFields._tags as string[]) : []
      const normDel = normalizeText(action.tag)
      const filtered = tags.filter((t) => normalizeText(t) !== normDel)
      await prisma.automationContact.update({
        where: { id: instance.contactId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { automationFields: { ...currentFields, _tags: filtered } as any },
      })
      break
    }

    case 'SET_VARIABLE': {
      // Merge into instance context — returned as contextPatch
      return {
        nextEdgeLabel: 'default',
        contextPatch:  { [action.key]: action.value },
      }
    }

    case 'SET_CONTACT_FIELD': {
      const contact = await prisma.automationContact.findUnique({
        where:  { id: instance.contactId },
        select: { automationFields: true },
      })
      const currentFields = (contact?.automationFields ?? {}) as Record<string, unknown>
      await prisma.automationContact.update({
        where: { id: instance.contactId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:  { automationFields: { ...currentFields, [action.key]: action.value } as any },
      })
      break
    }

    default: {
      const _never: never = action
      throw new TerminalError(`Unknown action type: ${(_never as { action: string }).action}`)
    }
  }

  return { nextEdgeLabel: 'default' }
}
