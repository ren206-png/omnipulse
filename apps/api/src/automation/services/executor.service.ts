/**
 * Automation Engine — Step Executor
 *
 * Processes one or more steps of a ContactFlowInstance within a single BullMQ
 * job. Execution loops until:
 *   • The instance reaches an END node  → COMPLETED
 *   • The instance reaches a WAIT node  → WAITING_FOR_INPUT or WAITING_UNTIL
 *   • MAX_STEPS_PER_JOB is reached      → CONTINUATION (re-queued)
 *   • An unrecoverable error occurs     → FAILED
 *
 * The caller (TriggerWorker / ExecuteWorker) is responsible for acquiring the
 * distributed lock BEFORE calling executeInstance and releasing it AFTER.
 *
 * Outbox entries (MESSAGE nodes) are written inside the execution loop so they
 * are durable before the instance state advances.
 */

import type { PrismaClient, FlowNode, FlowEdge } from '@prisma/client'
import { NodeConfigSchema, type ExecutionResult, type EvalContext, TerminalError, RetryableError } from '../types/index.js'
import { patchInstance } from './instanceManager.service.js'
import { executeMessageNode   } from './nodeExecutors/messageExecutor.js'
import { executeConditionNode } from './nodeExecutors/conditionExecutor.js'
import { executeActionNode    } from './nodeExecutors/actionExecutor.js'
import { executeWaitNode      } from './nodeExecutors/waitExecutor.js'
import { executeEndNode       } from './nodeExecutors/endExecutor.js'

/** Hard cap on nodes executed per job invocation to prevent infinite loops. */
const MAX_STEPS_PER_JOB = 50

type LoadedNode = FlowNode & { outgoingEdges: FlowEdge[] }

// ── Graph loader ──────────────────────────────────────────────────────────────

interface FlowGraph {
  nodesById:   Map<string, LoadedNode>
  nodesByKey:  Map<string, LoadedNode>
}

async function loadFlowGraph(prisma: PrismaClient, flowVersionId: string): Promise<FlowGraph> {
  const nodes = await prisma.flowNode.findMany({
    where:   { flowVersionId },
    include: { outgoingEdges: true },
  })
  const nodesById  = new Map(nodes.map((n) => [n.id, n as LoadedNode]))
  const nodesByKey = new Map(nodes.map((n) => [n.nodeKey, n as LoadedNode]))
  return { nodesById, nodesByKey }
}

// ── EvalContext builder ───────────────────────────────────────────────────────

async function buildEvalCtx(
  prisma: PrismaClient,
  instance: { contactId: string; context: unknown },
  inboundEventId?: string,
): Promise<EvalContext> {
  const [contact, inboundEvent] = await Promise.all([
    prisma.automationContact.findUnique({
      where:  { id: instance.contactId },
      select: {
        displayName:     true,
        channel:         true,
        automationOptedOut: true,
        automationFields: true,
      },
    }),
    inboundEventId
      ? prisma.inboundAutomationEvent.findUnique({
          where:  { id: inboundEventId },
          select: { text: true, normalizedText: true, quickReplyValue: true },
        })
      : null,
  ])

  const fields = (contact?.automationFields ?? {}) as Record<string, unknown>

  return {
    contact: {
      firstName: typeof fields['firstName'] === 'string' ? fields['firstName'] : contact?.displayName ?? undefined,
      channel:   contact?.channel ?? undefined,
      optedOut:  contact?.automationOptedOut ?? undefined,
      fields,
    },
    ctx: (instance.context as Record<string, unknown>) ?? {},
    event: {
      text:            inboundEvent?.text ?? undefined,
      quickReplyValue: inboundEvent?.quickReplyValue ?? undefined,
    },
  }
}

// ── Main executor ─────────────────────────────────────────────────────────────

export interface ExecuteOptions {
  instanceId:      string
  workspaceId:     string
  inboundEventId?: string
  attempt?:        number
}

export async function executeInstance(
  prisma: PrismaClient,
  opts: ExecuteOptions,
): Promise<ExecutionResult> {
  const { instanceId, inboundEventId, attempt = 1 } = opts

  // Load instance
  const instance = await prisma.contactFlowInstance.findUnique({
    where: { id: instanceId },
  })
  if (!instance) throw new TerminalError(`Instance "${instanceId}" not found`)

  // Only RUNNING instances can be executed
  if (instance.status !== 'RUNNING') {
    return {
      status:      'COMPLETED',
      nextNodeKey: undefined,
      reason:      `Instance already in status ${instance.status}`,
    }
  }

  if (!instance.currentNodeId) {
    throw new TerminalError(`Instance "${instanceId}" has no currentNodeId`)
  }

  // Load flow graph
  const graph = await loadFlowGraph(prisma, instance.flowVersionId)

  // Build eval context
  const evalCtx = await buildEvalCtx(prisma, instance, inboundEventId)

  let currentNode = graph.nodesById.get(instance.currentNodeId)
  if (!currentNode) throw new TerminalError(`Node "${instance.currentNodeId}" not in graph`)

  let context = (instance.context as Record<string, unknown>) ?? {}
  let steps = 0

  // ── Execution loop ────────────────────────────────────────────────────────
  while (steps < MAX_STEPS_PER_JOB) {
    steps++
    const node = currentNode
    const idempotencyKey = `${instanceId}:${node.id}:${attempt}`

    // Parse & validate node config
    const parsed = NodeConfigSchema.safeParse(node.config)
    if (!parsed.success) {
      throw new TerminalError(`Node "${node.nodeKey}" has invalid config`)
    }
    const config = parsed.data

    // Dispatch to per-type executor
    let result
    try {
      const execCtx = { prisma, instance: { ...instance, context } as Parameters<typeof executeMessageNode>[0]['instance'], node, config, evalCtx, inboundEventId, idempotencyKey }
      switch (config.nodeType) {
        case 'MESSAGE':   result = await executeMessageNode(execCtx);   break
        case 'CONDITION': result = await executeConditionNode(execCtx); break
        case 'ACTION':    result = await executeActionNode(execCtx);    break
        case 'WAIT':      result = await executeWaitNode(execCtx);      break
        case 'END':       result = await executeEndNode(execCtx);       break
        default: {
          const _never: never = config
          throw new TerminalError(`Unknown nodeType: ${(_never as { nodeType: string }).nodeType}`)
        }
      }
    } catch (err) {
      if (err instanceof RetryableError) throw err
      // TerminalError or unexpected — mark FAILED
      const reason = err instanceof Error ? err.message : String(err)
      await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
        status:       'FAILED',
        failureReason: reason,
        completedAt:  new Date(),
      })
      return { status: 'FAILED', reason }
    }

    // Merge context patch
    if (result.contextPatch) {
      context = { ...context, ...result.contextPatch }
    }

    // ── Terminal: END node ────────────────────────────────────────────────
    if (result.nextEdgeLabel === null && !result.waitingForInput) {
      await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
        status:      'COMPLETED',
        context,
        completedAt: new Date(),
        currentNodeId: node.id,
      })
      return { status: 'COMPLETED' }
    }

    // ── Wait: WAITING_UNTIL (DURATION / UNTIL) ────────────────────────────
    if (result.wakeAt && !result.waitingForInput) {
      // Advance currentNode to the next node so we resume at the right place
      const nextNode = resolveNextNode(graph, node, result.nextEdgeLabel!)
      await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
        status:       'WAITING_UNTIL',
        context,
        wakeAt:       result.wakeAt,
        currentNodeId: nextNode?.id ?? node.id,
      })
      return { status: 'WAITING_UNTIL', wakeAt: result.wakeAt }
    }

    // ── Wait: WAITING_FOR_INPUT ───────────────────────────────────────────
    if (result.waitingForInput) {
      await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
        status:       'WAITING_FOR_INPUT',
        context,
        wakeAt:       result.wakeAt ?? null,
        currentNodeId: node.id, // stay on the WAIT node; resume will advance
      })
      return {
        status:  'WAITING_FOR_INPUT',
        wakeAt:  result.wakeAt,
      }
    }

    // ── Continuation: advance to next node ────────────────────────────────
    const nextNode = resolveNextNode(graph, node, result.nextEdgeLabel!)
    if (!nextNode) {
      await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
        status:       'FAILED',
        failureReason: `No "${result.nextEdgeLabel}" edge from node "${node.nodeKey}"`,
        completedAt:  new Date(),
      })
      return { status: 'FAILED', reason: `No "${result.nextEdgeLabel}" edge from node "${node.nodeKey}"` }
    }

    // Persist intermediate state
    await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
      currentNodeId: nextNode.id,
      context,
    })

    currentNode = nextNode
  }

  // MAX_STEPS_PER_JOB reached — re-queue continuation
  await patchInstance(prisma, instanceId, instance.revision + steps - 1, {
    context,
    currentNodeId: currentNode.id,
  })
  return { status: 'CONTINUATION', nextNodeKey: currentNode.nodeKey }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveNextNode(graph: FlowGraph, node: LoadedNode, edgeLabel: string): LoadedNode | undefined {
  const edge = node.outgoingEdges.find((e) => e.label === edgeLabel)
  if (!edge) return undefined
  return graph.nodesById.get(edge.targetNodeId)
}
