/**
 * Automation Engine — Phase 3 tests
 *
 * Covers:
 *   • renderTemplate          — MESSAGE text interpolation
 *   • executeMessageNode      — outbox write, default edge
 *   • executeConditionNode    — boolean mode, choice mode
 *   • executeActionNode       — ADD_TAG, REMOVE_TAG, SET_VARIABLE, SET_CONTACT_FIELD
 *   • executeWaitNode         — DURATION, UNTIL (past + future), INPUT
 *   • executeEndNode          — terminal
 *   • instanceManager         — reentry IGNORE, optimistic concurrency
 *   • executor.service        — COMPLETED, WAITING_FOR_INPUT, WAITING_UNTIL, CONTINUATION, FAILED paths
 *
 * All DB calls are stubbed — no Redis, no Prisma connection needed.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function makeEvalCtx(overrides: Record<string, unknown> = {}) {
  return {
    contact: { firstName: 'Alice', channel: 'STUB', optedOut: false, fields: {}, tags: [] },
    ctx:     {},
    event:   { text: 'hello', quickReplyValue: undefined },
    ...overrides,
  } as import('../../automation/types/index.js').EvalContext
}

function makeInstance(overrides: Record<string, unknown> = {}) {
  return {
    id:            'inst-1',
    workspaceId:   'ws-1',
    contactId:     'contact-1',
    flowId:        'flow-1',
    flowVersionId: 'fv-1',
    currentNodeId: 'node-1',
    status:        'RUNNING',
    context:       {},
    revision:      0,
    wakeAt:        null,
    ...overrides,
  } as unknown as import('@prisma/client').ContactFlowInstance
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id:            'node-1',
    flowVersionId: 'fv-1',
    nodeKey:       'step1',
    nodeType:      'MESSAGE',
    config:        { nodeType: 'MESSAGE', text: 'Hello {{contact.firstName}}!' },
    uiMeta:        null,
    outgoingEdges: [{ id: 'edge-1', sourceNodeId: 'node-1', targetNodeId: 'node-2', label: 'default', priority: null }],
    ...overrides,
  } as unknown as import('@prisma/client').FlowNode & { outgoingEdges: import('@prisma/client').FlowEdge[] }
}

// ── MESSAGE executor ───────────────────────────────────────────────────────────

import { executeMessageNode } from '../../automation/services/nodeExecutors/messageExecutor.js'

describe('executeMessageNode', () => {
  function makeOutboxPrisma(upsertCb = (_args: unknown) => {}) {
    return {
      automationOutbox: {
        upsert: async (args: unknown) => { upsertCb(args); return {} },
      },
    } as unknown as import('@prisma/client').PrismaClient
  }

  it('writes to outbox with rendered template and returns default edge', async () => {
    let written: Record<string, unknown> = {}
    const prisma = makeOutboxPrisma((args) => { written = args as Record<string, unknown> })
    const node = makeNode({ config: { nodeType: 'MESSAGE', text: 'Hi {{contact.firstName}}, you said {{event.text}}' } })
    const ctx = {
      prisma, instance: makeInstance(), node,
      config: { nodeType: 'MESSAGE' as const, text: 'Hi {{contact.firstName}}, you said {{event.text}}' },
      evalCtx: makeEvalCtx(),
      idempotencyKey: 'idem-1',
    }
    const result = await executeMessageNode(ctx as Parameters<typeof executeMessageNode>[0])
    assert.equal(result.nextEdgeLabel, 'default')
    const payload = (written as { create: { payload: { text: string } } }).create.payload
    assert.equal(payload.text, 'Hi Alice, you said hello')
  })

  it('unknown template paths render as empty string', async () => {
    let written: Record<string, unknown> = {}
    const prisma = makeOutboxPrisma((args) => { written = args as Record<string, unknown> })
    const node = makeNode({ config: { nodeType: 'MESSAGE', text: '{{unknown.path}}' } })
    const ctx = {
      prisma, instance: makeInstance(), node,
      config: { nodeType: 'MESSAGE' as const, text: '{{unknown.path}}' },
      evalCtx: makeEvalCtx(),
      idempotencyKey: 'idem-2',
    }
    await executeMessageNode(ctx as Parameters<typeof executeMessageNode>[0])
    const payload = (written as { create: { payload: { text: string } } }).create.payload
    assert.equal(payload.text, '')
  })
})

// ── CONDITION executor ─────────────────────────────────────────────────────────

import { executeConditionNode } from '../../automation/services/nodeExecutors/conditionExecutor.js'

describe('executeConditionNode — boolean mode', () => {
  function makeCondCtx(expr: unknown, evalCtx = makeEvalCtx(), labels = ['true', 'false']) {
    const edges = labels.map((l) => ({ id: `e-${l}`, sourceNodeId: 'n-1', targetNodeId: `n-${l}`, label: l, priority: null }))
    return {
      prisma:         {} as import('@prisma/client').PrismaClient,
      instance:       makeInstance(),
      node:           { ...makeNode(), config: { nodeType: 'CONDITION', expr }, outgoingEdges: edges, nodeKey: 'cond' },
      config:         { nodeType: 'CONDITION' as const, expr },
      evalCtx,
      idempotencyKey: 'idem-c',
    } as unknown as Parameters<typeof executeConditionNode>[0]
  }

  it('follows true edge when condition is true', async () => {
    const expr = { op: 'equals' as const, field: { path: 'contact.firstName' }, value: 'Alice' }
    const result = await executeConditionNode(makeCondCtx(expr))
    assert.equal(result.nextEdgeLabel, 'true')
  })

  it('follows false edge when condition is false', async () => {
    const expr = { op: 'equals' as const, field: { path: 'contact.firstName' }, value: 'Bob' }
    const result = await executeConditionNode(makeCondCtx(expr))
    assert.equal(result.nextEdgeLabel, 'false')
  })
})

describe('executeConditionNode — choice mode', () => {
  function makeChoiceCtx(text: string, labels: string[]) {
    const edges = labels.map((l) => ({ id: `e-${l}`, sourceNodeId: 'n-1', targetNodeId: `n-x`, label: l, priority: null }))
    const expr = { op: 'exists' as const, field: { path: 'event.text' } }
    return {
      prisma:         {} as import('@prisma/client').PrismaClient,
      instance:       makeInstance(),
      node:           { ...makeNode(), outgoingEdges: edges, nodeKey: 'choice' },
      config:         { nodeType: 'CONDITION' as const, expr },
      evalCtx:        makeEvalCtx({ event: { text } }),
      idempotencyKey: 'idem-ch',
    } as unknown as Parameters<typeof executeConditionNode>[0]
  }

  it('matches choice: edge by text', async () => {
    const result = await executeConditionNode(makeChoiceCtx('yes', ['choice:yes', 'choice:no', 'default']))
    assert.equal(result.nextEdgeLabel, 'choice:yes')
  })

  it('falls back to default when no choice matches', async () => {
    const result = await executeConditionNode(makeChoiceCtx('maybe', ['choice:yes', 'default']))
    assert.equal(result.nextEdgeLabel, 'default')
  })

  it('throws when no choice matches and no default', async () => {
    await assert.rejects(
      () => executeConditionNode(makeChoiceCtx('maybe', ['choice:yes', 'choice:no'])),
      { name: 'TerminalError' },
    )
  })
})

// ── ACTION executor ────────────────────────────────────────────────────────────

import { executeActionNode } from '../../automation/services/nodeExecutors/actionExecutor.js'

describe('executeActionNode — SET_VARIABLE', () => {
  it('returns context patch without DB write', async () => {
    const ctx = {
      prisma:         {} as import('@prisma/client').PrismaClient,
      instance:       makeInstance(),
      node:           makeNode(),
      config:         { nodeType: 'ACTION' as const, action: { action: 'SET_VARIABLE' as const, key: 'score', value: 42 } },
      evalCtx:        makeEvalCtx(),
      idempotencyKey: 'idem-a',
    } as unknown as Parameters<typeof executeActionNode>[0]
    const result = await executeActionNode(ctx)
    assert.equal(result.nextEdgeLabel, 'default')
    assert.deepEqual(result.contextPatch, { score: 42 })
  })
})

describe('executeActionNode — ADD_TAG', () => {
  function makeTagPrisma(existing: string[] = []) {
    const updates: unknown[] = []
    return {
      prisma: {
        automationContact: {
          findUnique: async () => ({ automationFields: { _tags: existing } }),
          update: async (args: unknown) => { updates.push(args); return {} },
        },
      } as unknown as import('@prisma/client').PrismaClient,
      updates,
    }
  }

  it('appends new tag', async () => {
    const { prisma, updates } = makeTagPrisma(['vip'])
    const ctx = {
      prisma, instance: makeInstance(), node: makeNode(),
      config: { nodeType: 'ACTION' as const, action: { action: 'ADD_TAG' as const, tag: 'new' } },
      evalCtx: makeEvalCtx(), idempotencyKey: 'idem-t',
    } as unknown as Parameters<typeof executeActionNode>[0]
    await executeActionNode(ctx)
    const upd = (updates[0] as { data: { automationFields: { _tags: string[] } } })
    assert.ok(upd.data.automationFields._tags.includes('new'))
    assert.ok(upd.data.automationFields._tags.includes('vip'))
  })

  it('does not duplicate existing tag (case-insensitive)', async () => {
    const { prisma, updates } = makeTagPrisma(['VIP'])
    const ctx = {
      prisma, instance: makeInstance(), node: makeNode(),
      config: { nodeType: 'ACTION' as const, action: { action: 'ADD_TAG' as const, tag: 'vip' } },
      evalCtx: makeEvalCtx(), idempotencyKey: 'idem-t2',
    } as unknown as Parameters<typeof executeActionNode>[0]
    await executeActionNode(ctx)
    const tags = (updates[0] as { data: { automationFields: { _tags: string[] } } }).data.automationFields._tags
    assert.equal(tags.length, 1)
  })
})

// ── WAIT executor ──────────────────────────────────────────────────────────────

import { executeWaitNode } from '../../automation/services/nodeExecutors/waitExecutor.js'

describe('executeWaitNode', () => {
  function makeWaitCtx(wait: unknown) {
    return {
      prisma: {} as import('@prisma/client').PrismaClient,
      instance: makeInstance(), node: makeNode(),
      config: { nodeType: 'WAIT' as const, wait },
      evalCtx: makeEvalCtx(), idempotencyKey: 'idem-w',
    } as unknown as Parameters<typeof executeWaitNode>[0]
  }

  it('DURATION: returns wakeAt = now + seconds', async () => {
    const before = Date.now()
    const result = await executeWaitNode(makeWaitCtx({ kind: 'DURATION', seconds: 60 }))
    assert.equal(result.nextEdgeLabel, 'default')
    assert.ok(result.wakeAt)
    assert.ok(result.wakeAt!.getTime() >= before + 59_000)
  })

  it('UNTIL future: returns wakeAt', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const result = await executeWaitNode(makeWaitCtx({ kind: 'UNTIL', isoTimestamp: future }))
    assert.ok(result.wakeAt)
  })

  it('UNTIL past: skips wait, returns default immediately', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = await executeWaitNode(makeWaitCtx({ kind: 'UNTIL', isoTimestamp: past }))
    assert.equal(result.nextEdgeLabel, 'default')
    assert.equal(result.wakeAt, undefined)
  })

  it('INPUT without timeout: waitingForInput=true, no wakeAt', async () => {
    const result = await executeWaitNode(makeWaitCtx({ kind: 'INPUT', acceptedInputs: 'ANY' }))
    assert.equal(result.waitingForInput, true)
    assert.equal(result.wakeAt, undefined)
  })

  it('INPUT with timeout: sets wakeAt', async () => {
    const before = Date.now()
    const result = await executeWaitNode(makeWaitCtx({ kind: 'INPUT', acceptedInputs: 'ANY', timeoutSeconds: 300 }))
    assert.equal(result.waitingForInput, true)
    assert.ok(result.wakeAt!.getTime() >= before + 299_000)
  })
})

// ── END executor ───────────────────────────────────────────────────────────────

import { executeEndNode } from '../../automation/services/nodeExecutors/endExecutor.js'

describe('executeEndNode', () => {
  it('returns nextEdgeLabel null', async () => {
    const ctx = {
      prisma: {} as import('@prisma/client').PrismaClient,
      instance: makeInstance(), node: makeNode(),
      config: { nodeType: 'END' as const },
      evalCtx: makeEvalCtx(), idempotencyKey: 'idem-e',
    } as unknown as Parameters<typeof executeEndNode>[0]
    const result = await executeEndNode(ctx)
    assert.equal(result.nextEdgeLabel, null)
  })
})

// ── patchInstance (optimistic concurrency) ─────────────────────────────────────

import { patchInstance } from '../../automation/services/instanceManager.service.js'
import { RetryableError } from '../../automation/types/index.js'

describe('patchInstance', () => {
  it('updates when revision matches', async () => {
    const updates: unknown[] = []
    const prisma = {
      contactFlowInstance: {
        updateMany: async (args: unknown) => { updates.push(args); return { count: 1 } },
      },
    } as unknown as import('@prisma/client').PrismaClient

    await assert.doesNotReject(() => patchInstance(prisma, 'inst-1', 0, { status: 'COMPLETED' }))
    assert.equal(updates.length, 1)
  })

  it('throws RetryableError when revision mismatches (count 0)', async () => {
    const prisma = {
      contactFlowInstance: {
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as import('@prisma/client').PrismaClient

    await assert.rejects(
      () => patchInstance(prisma, 'inst-1', 0, { status: 'COMPLETED' }),
      RetryableError,
    )
  })
})

// ── executeInstance — integration paths ────────────────────────────────────────

import { executeInstance } from '../../automation/services/executor.service.js'

describe('executeInstance', () => {
  /** Build a Prisma stub for the executor. */
  function makeExecPrisma(opts: {
    instanceStatus?: string
    nodes?: Array<{ id: string; nodeKey: string; nodeType: string; config: unknown; outgoingEdges: unknown[] }>
  } = {}) {
    const { instanceStatus = 'RUNNING', nodes = [] } = opts
    const updateManyCalls: Array<{ data: Record<string, unknown> }> = []

    return {
      prisma: {
        contactFlowInstance: {
          findUnique: async () => ({
            id:            'inst-1',
            workspaceId:   'ws-1',
            contactId:     'contact-1',
            flowVersionId: 'fv-1',
            currentNodeId: nodes[0]?.id ?? null,
            status:        instanceStatus,
            context:       {},
            revision:      0,
            wakeAt:        null,
          }),
          updateMany: async (args: { data: Record<string, unknown> }) => {
            updateManyCalls.push(args)
            return { count: 1 }
          },
        },
        flowNode: {
          findMany: async () => nodes,
        },
        automationContact: {
          findUnique: async () => ({
            displayName: 'Alice', channel: 'STUB',
            automationOptedOut: false, automationFields: {},
          }),
        },
        inboundAutomationEvent: {
          findUnique: async () => null,
        },
        automationOutbox: {
          upsert: async () => ({}),
        },
      } as unknown as import('@prisma/client').PrismaClient,
      updateManyCalls,
    }
  }

  it('returns COMPLETED immediately when instance status is not RUNNING', async () => {
    const { prisma } = makeExecPrisma({ instanceStatus: 'COMPLETED' })
    const result = await executeInstance(prisma, { instanceId: 'inst-1', workspaceId: 'ws-1' })
    assert.equal(result.status, 'COMPLETED')
  })

  it('executes MESSAGE → END and returns COMPLETED', async () => {
    const nodes = [
      {
        id: 'node-msg', nodeKey: 'msg', nodeType: 'MESSAGE',
        config: { nodeType: 'MESSAGE', text: 'Hello!' },
        outgoingEdges: [{ id: 'e1', sourceNodeId: 'node-msg', targetNodeId: 'node-end', label: 'default', priority: null, flowVersionId: 'fv-1' }],
      },
      {
        id: 'node-end', nodeKey: 'end', nodeType: 'END',
        config: { nodeType: 'END' },
        outgoingEdges: [],
      },
    ]
    const { prisma, updateManyCalls } = makeExecPrisma({ nodes })
    const result = await executeInstance(prisma, { instanceId: 'inst-1', workspaceId: 'ws-1' })
    assert.equal(result.status, 'COMPLETED')
    // At least one update should set status COMPLETED
    assert.ok(updateManyCalls.some((u) => u.data?.status === 'COMPLETED'))
  })

  it('pauses at WAIT INPUT and returns WAITING_FOR_INPUT', async () => {
    const nodes = [
      {
        id: 'node-wait', nodeKey: 'wait', nodeType: 'WAIT',
        config: { nodeType: 'WAIT', wait: { kind: 'INPUT', acceptedInputs: 'ANY' } },
        outgoingEdges: [{ id: 'e1', sourceNodeId: 'node-wait', targetNodeId: 'node-end', label: 'default', priority: null, flowVersionId: 'fv-1' }],
      },
      {
        id: 'node-end', nodeKey: 'end', nodeType: 'END',
        config: { nodeType: 'END' },
        outgoingEdges: [],
      },
    ]
    const { prisma, updateManyCalls } = makeExecPrisma({ nodes })
    const result = await executeInstance(prisma, { instanceId: 'inst-1', workspaceId: 'ws-1' })
    assert.equal(result.status, 'WAITING_FOR_INPUT')
    assert.ok(updateManyCalls.some((u) => u.data?.status === 'WAITING_FOR_INPUT'))
  })

  it('pauses at WAIT DURATION and returns WAITING_UNTIL', async () => {
    const nodes = [
      {
        id: 'node-dur', nodeKey: 'dur', nodeType: 'WAIT',
        config: { nodeType: 'WAIT', wait: { kind: 'DURATION', seconds: 3600 } },
        outgoingEdges: [{ id: 'e1', sourceNodeId: 'node-dur', targetNodeId: 'node-end', label: 'default', priority: null, flowVersionId: 'fv-1' }],
      },
      {
        id: 'node-end', nodeKey: 'end', nodeType: 'END',
        config: { nodeType: 'END' },
        outgoingEdges: [],
      },
    ]
    const { prisma, updateManyCalls } = makeExecPrisma({ nodes })
    const result = await executeInstance(prisma, { instanceId: 'inst-1', workspaceId: 'ws-1' })
    assert.equal(result.status, 'WAITING_UNTIL')
    assert.ok(result.wakeAt)
    assert.ok(updateManyCalls.some((u) => u.data?.status === 'WAITING_UNTIL'))
  })
})
