/**
 * Shared types for node executors.
 */

import type { PrismaClient } from '../../../../generated/prisma/client.js'
import type { ContactFlowInstance, FlowNode, FlowEdge } from '../../../../generated/prisma/client.js'
import type { NodeConfig, EvalContext } from '../../types/index.js'

export interface NodeExecutionContext {
  prisma:          PrismaClient
  /** Instance with context already cast to a plain object for safe spreading. */
  instance:        Omit<ContactFlowInstance, 'context'> & { context: Record<string, unknown> }
  node:            FlowNode & { outgoingEdges: FlowEdge[] }
  config:          NodeConfig
  evalCtx:         EvalContext
  inboundEventId?: string
  /** Unique key for this node execution (used for NodeExecution idempotency) */
  idempotencyKey:  string
}

export type NextEdgeLabel = string | null

export interface NodeExecutionResult {
  /** Edge label to follow. null = terminal (END node). */
  nextEdgeLabel: NextEdgeLabel
  /** If set, the instance context will be merged with these values. */
  contextPatch?: Record<string, unknown>
  /** If set, the instance will be set to WAITING_UNTIL with this wakeAt. */
  wakeAt?: Date
  /** If set, instance transitions to WAITING_FOR_INPUT. */
  waitingForInput?: boolean
}
