/**
 * Automation Engine — Instance Manager
 *
 * Creates, loads, and transitions ContactFlowInstance records.
 * Enforces reentry policy (IGNORE / RESTART / ALLOW_PARALLEL).
 *
 * All DB writes use optimistic concurrency via the `revision` field:
 *   UPDATE ... WHERE id = ? AND revision = ?   (increments revision)
 * If the update matches 0 rows the instance was modified concurrently → caller
 * should treat as a RetryableError.
 */

import type { PrismaClient, ContactFlowInstance } from '@prisma/client'
import type { MatchedFlow } from './triggerMatcher.service.js'
import { RetryableError } from '../types/index.js'

export interface CreateInstanceInput {
  workspaceId:    string
  contactId:      string
  conversationId?: string
  flow:           MatchedFlow
  inboundEventId?: string
  expiresAt?:     Date
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Enforce reentry policy and (if allowed) create a new instance.
 * Returns null when the policy is IGNORE and a live instance already exists.
 */
export async function createInstance(
  prisma: PrismaClient,
  input: CreateInstanceInput,
): Promise<ContactFlowInstance | null> {
  const { workspaceId, contactId, flow } = input

  // Load flow + reentry policy
  const flowRecord = await prisma.automationFlow.findUnique({
    where: { id: flow.flowId },
    select: { reentryPolicy: true, maxParallelInstancesPerContact: true },
  })
  if (!flowRecord) throw new Error(`Flow "${flow.flowId}" not found`)

  const { reentryPolicy, maxParallelInstancesPerContact } = flowRecord

  // Check for existing live instances
  const liveInstances = await prisma.contactFlowInstance.findMany({
    where: {
      workspaceId,
      contactId,
      flowId: flow.flowId,
      status: { in: ['RUNNING', 'WAITING_FOR_INPUT', 'WAITING_UNTIL'] },
    },
    select: { id: true, revision: true },
    orderBy: { startedAt: 'asc' },
  })

  if (liveInstances.length > 0) {
    switch (reentryPolicy) {
      case 'IGNORE':
        return null

      case 'RESTART': {
        // Cancel all live instances before creating a new one
        await prisma.contactFlowInstance.updateMany({
          where: { id: { in: liveInstances.map((i) => i.id) } },
          data:  { status: 'CANCELLED', completedAt: new Date() },
        })
        break
      }

      case 'ALLOW_PARALLEL': {
        if (liveInstances.length >= maxParallelInstancesPerContact) {
          return null // at capacity
        }
        break
      }
    }
  }

  // Find the entry FlowNode id
  const entryNode = await prisma.flowNode.findUnique({
    where: {
      flowVersionId_nodeKey: {
        flowVersionId: flow.flowVersionId,
        nodeKey:       flow.entryNodeKey,
      },
    },
    select: { id: true },
  })
  if (!entryNode) throw new Error(`Entry node "${flow.entryNodeKey}" not found in version "${flow.flowVersionId}"`)

  const instance = await prisma.contactFlowInstance.create({
    data: {
      workspaceId,
      contactId,
      conversationId: input.conversationId,
      flowId:         flow.flowId,
      flowVersionId:  flow.flowVersionId,
      currentNodeId:  entryNode.id,
      status:         'RUNNING',
      expiresAt:      input.expiresAt,
    },
  })

  return instance
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadInstance(
  prisma: PrismaClient,
  instanceId: string,
): Promise<ContactFlowInstance> {
  const instance = await prisma.contactFlowInstance.findUnique({
    where: { id: instanceId },
  })
  if (!instance) throw new Error(`Instance "${instanceId}" not found`)
  return instance
}

// ── Optimistic update ─────────────────────────────────────────────────────────

export interface InstancePatch {
  currentNodeId?: string | null
  status?:        ContactFlowInstance['status']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?:       any // Prisma InputJsonValue — Record<string, unknown> is structurally compatible
  wakeAt?:        Date | null
  completedAt?:   Date | null
  failureReason?: string | null
}

/**
 * Apply a patch to an instance using optimistic concurrency.
 * Throws RetryableError if revision mismatch (concurrent update detected).
 */
export async function patchInstance(
  prisma: PrismaClient,
  instanceId: string,
  revision: number,
  patch: InstancePatch,
): Promise<void> {
  const result = await prisma.contactFlowInstance.updateMany({
    where:  { id: instanceId, revision },
    data:   { ...patch, revision: revision + 1, lastEventAt: new Date() },
  })

  if (result.count === 0) {
    throw new RetryableError(
      `Optimistic concurrency conflict on instance "${instanceId}" at revision ${revision}`,
    )
  }
}
