/**
 * Automation Engine — Trigger Matcher
 *
 * Given a NormalizedInboundEvent, loads all PUBLISHED flow versions for the
 * workspace and returns those whose triggerConfig matches the event.
 *
 * Matching rules per trigger type:
 *   KEYWORD      — normalizedText matches at least one keyword per matchMode.
 *   FIRST_CONTACT — event.isFirstContact is true.
 *   ANY_MESSAGE  — always matches (channel filter still applied).
 *   WEBHOOK_EVENT — event.webhookEventType equals trigger.eventType.
 *
 * Channel filter: if trigger.channel is set, event.channel must equal it.
 *
 * Results are sorted by flow.priority descending (highest first).
 */

import type { PrismaClient } from '../../../generated/prisma/client.js'
import type { NormalizedInboundEvent, TriggerConfig } from '../types/index.js'
import { TriggerConfigSchema } from '../types/index.js'
import { normalizeText } from './conditionEvaluator.js'

export interface MatchedFlow {
  flowId:       string
  flowVersionId: string
  entryNodeKey: string
  priority:     number
}

/**
 * Loads all PUBLISHED automation flows for the workspace and returns those
 * whose trigger configuration matches the inbound event.
 */
export async function matchTriggers(
  prisma: PrismaClient,
  event: NormalizedInboundEvent,
): Promise<MatchedFlow[]> {
  const versions = await prisma.automationFlowVersion.findMany({
    where: {
      status: 'PUBLISHED',
      flow: {
        workspaceId: event.workspaceId,
        status: 'PUBLISHED',
      },
    },
    select: {
      id:           true,
      flowId:       true,
      triggerConfig: true,
      entryNodeKey: true,
      flow: {
        select: { priority: true },
      },
    },
  })

  const matches: MatchedFlow[] = []

  for (const version of versions) {
    const parsed = TriggerConfigSchema.safeParse(version.triggerConfig)
    if (!parsed.success) continue // skip corrupted trigger configs

    if (matchesTrigger(parsed.data, event)) {
      matches.push({
        flowId:       version.flowId,
        flowVersionId: version.id,
        entryNodeKey: version.entryNodeKey,
        priority:     version.flow.priority,
      })
    }
  }

  // Higher priority first; stable sort preserves DB order for equal priority.
  matches.sort((a, b) => b.priority - a.priority)
  return matches
}

/**
 * Pure function: returns true if the trigger configuration matches the event.
 * Exported for unit testing.
 */
export function matchesTrigger(trigger: TriggerConfig, event: NormalizedInboundEvent): boolean {
  // Channel filter — if trigger specifies a channel, event must match.
  if (trigger.channel && trigger.channel !== event.channel) return false

  switch (trigger.type) {
    case 'KEYWORD': {
      // Use pre-normalised text if available, otherwise normalise on the fly.
      const text = event.normalizedText ?? normalizeText(event.text ?? '')
      if (!text) return false

      return trigger.keywords.some((kw) => {
        const normKw = normalizeText(kw)
        switch (trigger.matchMode ?? 'EXACT') {
          case 'EXACT':       return text === normKw
          case 'CONTAINS':    return text.includes(normKw)
          case 'STARTS_WITH': return text.startsWith(normKw)
          default:            return text === normKw
        }
      })
    }

    case 'FIRST_CONTACT':
      return event.isFirstContact === true

    case 'ANY_MESSAGE':
      return true

    case 'WEBHOOK_EVENT':
      return !!event.webhookEventType && event.webhookEventType === trigger.eventType

    default: {
      // Exhaustiveness guard — TriggerConfig union is closed.
      const _never: never = trigger
      void _never
      return false
    }
  }
}
