/**
 * Automation Engine — Phase 2 tests
 *
 * Covers:
 *   • matchesTrigger  — pure function, no DB required.
 *   • globalGuards    — stubbed Prisma.
 *   • ingestion       — stubbed Prisma, idempotency.
 *   • coordinateTrigger — full coordinator with all stubs.
 *
 * Uses node:test and node:assert only. No Jest/Vitest.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal NormalizedInboundEvent for tests. */
function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId:        'ws-1',
    channel:            'STUB' as const,
    idempotencyKey:     'idem-1',
    derivedIdempotency: false,
    senderId:           'sender-1',
    isFirstContact:     false,
    rawPayload:         {},
    receivedAt:         new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

// ── matchesTrigger ────────────────────────────────────────────────────────────

import { matchesTrigger } from '../../automation/services/triggerMatcher.service.js'

describe('matchesTrigger — KEYWORD', () => {
  it('EXACT match (case-insensitive)', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['Hello'], matchMode: 'EXACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'hello' })), true)
  })

  it('EXACT — no match on substring', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['hi'], matchMode: 'EXACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'hi there' })), false)
  })

  it('CONTAINS match', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['promo'], matchMode: 'CONTAINS' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'get a promo code' })), true)
  })

  it('STARTS_WITH match', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['start'], matchMode: 'STARTS_WITH' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'start the flow' })), true)
  })

  it('STARTS_WITH — no match when keyword not at start', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['start'], matchMode: 'STARTS_WITH' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'please start' })), false)
  })

  it('multiple keywords — matches any', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['hi', 'hello'], matchMode: 'EXACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'hi' })), true)
  })

  it('no text → false', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['hello'], matchMode: 'EXACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({})), false)
  })

  it('channel filter mismatch → false', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['hello'], matchMode: 'EXACT' as const, channel: 'INSTAGRAM' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'hello' })), false)
  })

  it('channel filter match → true', () => {
    const trigger = { type: 'KEYWORD' as const, keywords: ['hello'], matchMode: 'EXACT' as const, channel: 'STUB' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ normalizedText: 'hello' })), true)
  })
})

describe('matchesTrigger — FIRST_CONTACT', () => {
  it('matches when isFirstContact is true', () => {
    const trigger = { type: 'FIRST_CONTACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ isFirstContact: true })), true)
  })

  it('does not match when isFirstContact is false', () => {
    const trigger = { type: 'FIRST_CONTACT' as const }
    assert.equal(matchesTrigger(trigger, makeEvent({ isFirstContact: false })), false)
  })
})

describe('matchesTrigger — ANY_MESSAGE', () => {
  it('always matches', () => {
    const trigger = { type: 'ANY_MESSAGE' as const }
    assert.equal(matchesTrigger(trigger, makeEvent()), true)
  })

  it('channel filter respected', () => {
    const trigger = { type: 'ANY_MESSAGE' as const, channel: 'FACEBOOK' as const }
    assert.equal(matchesTrigger(trigger, makeEvent()), false)
  })
})

describe('matchesTrigger — WEBHOOK_EVENT', () => {
  it('matches on exact eventType', () => {
    const trigger = { type: 'WEBHOOK_EVENT' as const, eventType: 'order.created' }
    assert.equal(matchesTrigger(trigger, makeEvent({ webhookEventType: 'order.created' })), true)
  })

  it('does not match different eventType', () => {
    const trigger = { type: 'WEBHOOK_EVENT' as const, eventType: 'order.created' }
    assert.equal(matchesTrigger(trigger, makeEvent({ webhookEventType: 'order.updated' })), false)
  })

  it('does not match when webhookEventType is absent', () => {
    const trigger = { type: 'WEBHOOK_EVENT' as const, eventType: 'order.created' }
    assert.equal(matchesTrigger(trigger, makeEvent()), false)
  })
})

// ── globalGuards ──────────────────────────────────────────────────────────────

import { assertWorkspaceAutomationEnabled, assertContactNotOptedOut, AutomationDisabledError, ContactOptedOutError } from '../../automation/services/globalGuards.js'

function makePrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      findUnique: async () => ({ automationEnabled: true }),
    },
    automationContact: {
      findUnique: async () => ({ automationOptedOut: false }),
    },
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient
}

describe('globalGuards — assertWorkspaceAutomationEnabled', () => {
  before(() => { process.env.AUTOMATION_ENGINE_ENABLED = 'true' })
  after(() => { delete process.env.AUTOMATION_ENGINE_ENABLED })

  it('passes when workspace has automation enabled', async () => {
    await assert.doesNotReject(() =>
      assertWorkspaceAutomationEnabled(makePrismaStub(), 'ws-1'),
    )
  })

  it('throws AutomationDisabledError when workspace flag is false', async () => {
    const prisma = makePrismaStub({
      workspace: { findUnique: async () => ({ automationEnabled: false }) },
    })
    await assert.rejects(
      () => assertWorkspaceAutomationEnabled(prisma, 'ws-1'),
      AutomationDisabledError,
    )
  })

  it('throws when global env flag is off', async () => {
    process.env.AUTOMATION_ENGINE_ENABLED = 'false'
    await assert.rejects(
      () => assertWorkspaceAutomationEnabled(makePrismaStub(), 'ws-1'),
      AutomationDisabledError,
    )
    process.env.AUTOMATION_ENGINE_ENABLED = 'true'
  })

  it('throws when workspace not found', async () => {
    const prisma = makePrismaStub({
      workspace: { findUnique: async () => null },
    })
    await assert.rejects(
      () => assertWorkspaceAutomationEnabled(prisma, 'ws-missing'),
      AutomationDisabledError,
    )
  })
})

describe('globalGuards — assertContactNotOptedOut', () => {
  it('passes when contact is not opted out', async () => {
    await assert.doesNotReject(() =>
      assertContactNotOptedOut(makePrismaStub(), 'contact-1'),
    )
  })

  it('throws ContactOptedOutError when opted out', async () => {
    const prisma = makePrismaStub({
      automationContact: { findUnique: async () => ({ automationOptedOut: true }) },
    })
    await assert.rejects(
      () => assertContactNotOptedOut(prisma, 'contact-1'),
      ContactOptedOutError,
    )
  })

  it('passes when contact not found (no opt-out record)', async () => {
    const prisma = makePrismaStub({
      automationContact: { findUnique: async () => null },
    })
    await assert.doesNotReject(() =>
      assertContactNotOptedOut(prisma, 'contact-unknown'),
    )
  })
})

// ── ingestion.service ─────────────────────────────────────────────────────────

import { ingestEvent } from '../../automation/services/ingestion.service.js'

function makeIngestionPrisma(opts: {
  contactId?: string
  existingEvent?: unknown
} = {}) {
  const contactId = opts.contactId ?? 'contact-42'
  let eventIdCounter = 0
  return {
    automationContact: {
      upsert: async () => ({
        id:                 contactId,
        workspaceId:        'ws-1',
        channel:            'STUB',
        channelUserId:      'sender-1',
        automationOptedOut: false,
        firstSeenAt:        new Date(),
        lastSeenAt:         new Date(),
      }),
    },
    inboundAutomationEvent: {
      findUnique: async () => opts.existingEvent ?? null,
      create: async (args: { data: Record<string, unknown> }) => ({
        id:              `event-${++eventIdCounter}`,
        ...args.data,
      }),
    },
  } as unknown as import('@prisma/client').PrismaClient
}

describe('ingestEvent', () => {
  it('creates event and returns isDuplicate=false on first call', async () => {
    const prisma = makeIngestionPrisma()
    const result = await ingestEvent(prisma, makeEvent({ text: 'hello' }))
    assert.equal(result.isDuplicate, false)
    assert.equal(result.contact.id, 'contact-42')
    assert.ok(result.event.id)
  })

  it('returns isDuplicate=true when event already exists', async () => {
    const existing = {
      id:               'event-existing',
      workspaceId:      'ws-1',
      idempotencyKey:   'idem-1',
      processingStatus: 'PENDING',
    }
    const prisma = makeIngestionPrisma({ existingEvent: existing })
    const result = await ingestEvent(prisma, makeEvent())
    assert.equal(result.isDuplicate, true)
    assert.equal(result.event.id, 'event-existing')
  })

  it('sets processingStatus to PENDING on new event', async () => {
    const prisma = makeIngestionPrisma()
    const result = await ingestEvent(prisma, makeEvent())
    assert.equal((result.event as Record<string, unknown>).processingStatus, 'PENDING')
  })
})

// ── coordinateTrigger ─────────────────────────────────────────────────────────

import { coordinateTrigger } from '../../automation/services/triggerCoordinator.service.js'

/**
 * Build a full coordinator stub.
 * Patches the modules that coordinateTrigger depends on to avoid real Redis/DB.
 *
 * Because ESM module mocking is not natively supported in node:test without
 * additional tooling, we test the coordinator through a dependency-injection
 * shim: we verify the observable outputs (returned result + prisma calls)
 * by building minimal stubs that record invocations.
 *
 * Note: coordinateTrigger imports from its deps at import time, so we exercise
 * it through an integration-style test with carefully crafted prisma stubs that
 * simulate every code path.
 */

describe('coordinateTrigger — paths', () => {
  before(() => { process.env.AUTOMATION_ENGINE_ENABLED = 'true' })
  after(() => { delete process.env.AUTOMATION_ENGINE_ENABLED })

  /** Stub enqueue that records calls without connecting to Redis. */
  function makeEnqueue() {
    const calls: unknown[][] = []
    const fn = async (jobs: unknown[]) => { calls.push(jobs); return [] }
    return { fn, calls }
  }

  /** Stub resume fn — like makeEnqueue but for resume jobs. */
  function makeResume() {
    const calls: unknown[][] = []
    const fn = async (jobs: unknown[]) => { calls.push(jobs); return [] }
    return { fn, calls }
  }

  function makeCoordPrisma(opts: {
    automationEnabled?: boolean
    optedOut?: boolean
    existingEvent?: unknown
    flowVersions?: unknown[]
    waitingInstances?: unknown[]
  } = {}) {
    const {
      automationEnabled  = true,
      optedOut           = false,
      existingEvent      = null,
      flowVersions       = [],
      waitingInstances   = [],
    } = opts

    const updateCalls: Array<{ data: { processingStatus: string } }> = []

    const prisma = {
      workspace: {
        findUnique: async () => ({ automationEnabled }),
      },
      automationContact: {
        upsert: async () => ({ id: 'contact-1', automationOptedOut: optedOut }),
        findUnique: async () => ({ automationOptedOut: optedOut }),
      },
      inboundAutomationEvent: {
        findUnique: async () => existingEvent,
        create: async (args: { data: Record<string, unknown> }) => ({
          id: 'event-new',
          ...args.data,
        }),
        update: async (args: { data: { processingStatus: string } }) => {
          updateCalls.push(args)
          return {}
        },
      },
      contactFlowInstance: {
        findMany: async () => waitingInstances,
      },
      automationFlowVersion: {
        findMany: async () => flowVersions,
      },
      _updateCalls: updateCalls,
    } as unknown as import('@prisma/client').PrismaClient & {
      _updateCalls: Array<{ data: { processingStatus: string } }>
    }

    return prisma
  }

  it('returns isDuplicate=true for duplicate events without enqueueing', async () => {
    const existing = { id: 'event-dupe', processingStatus: 'PROCESSED' }
    const prisma = makeCoordPrisma({ existingEvent: existing })
    const { fn } = makeEnqueue(); const { fn: res } = makeResume()
    const result = await coordinateTrigger(prisma, makeEvent(), fn, res)
    assert.equal(result.isDuplicate, true)
    assert.equal(result.enqueuedCount, 0)
  })

  it('returns enqueuedCount=0 when contact is opted out', async () => {
    const prisma = makeCoordPrisma({ optedOut: true })
    const { fn } = makeEnqueue(); const { fn: res } = makeResume()
    const result = await coordinateTrigger(prisma, makeEvent(), fn, res)
    assert.equal(result.isDuplicate, false)
    assert.equal(result.enqueuedCount, 0)
    assert.ok(prisma._updateCalls.some((u) => u.data?.processingStatus === 'IGNORED'))
  })

  it('returns enqueuedCount=0 when no flows match', async () => {
    const prisma = makeCoordPrisma({ flowVersions: [], waitingInstances: [] })
    const { fn } = makeEnqueue(); const { fn: res } = makeResume()
    const result = await coordinateTrigger(prisma, makeEvent({ normalizedText: 'hello' }), fn, res)
    assert.equal(result.isDuplicate, false)
    assert.equal(result.enqueuedCount, 0)
    assert.equal(result.resumedCount, 0)
    assert.ok(prisma._updateCalls.some((u) => u.data?.processingStatus === 'IGNORED'))
  })

  it('enqueues one job per matched flow and marks event PROCESSED', async () => {
    const flowVersions = [
      { id: 'fv-1', flowId: 'flow-1', entryNodeKey: 'start', triggerConfig: { type: 'ANY_MESSAGE' }, flow: { priority: 0 } },
      { id: 'fv-2', flowId: 'flow-2', entryNodeKey: 'start', triggerConfig: { type: 'ANY_MESSAGE' }, flow: { priority: 1 } },
    ]
    const prisma = makeCoordPrisma({ flowVersions, waitingInstances: [] })
    const { fn, calls } = makeEnqueue(); const { fn: res } = makeResume()
    const result = await coordinateTrigger(prisma, makeEvent(), fn, res)
    assert.equal(result.isDuplicate, false)
    assert.equal(result.enqueuedCount, 2)
    assert.equal(result.resumedCount, 0)
    assert.equal(calls.length, 1)
    assert.equal((calls[0] as unknown[]).length, 2)
    assert.ok(prisma._updateCalls.some((u) => u.data?.processingStatus === 'PROCESSED'))
  })

  it('resumes WAITING_FOR_INPUT instances and enqueues trigger jobs', async () => {
    const flowVersions = [
      { id: 'fv-1', flowId: 'flow-1', entryNodeKey: 'start', triggerConfig: { type: 'ANY_MESSAGE' }, flow: { priority: 0 } },
    ]
    const waitingInstances = [
      { id: 'inst-waiting', workspaceId: 'ws-1' },
    ]
    const prisma = makeCoordPrisma({ flowVersions, waitingInstances })
    const { fn, calls } = makeEnqueue(); const { fn: res, calls: resCalls } = makeResume()
    const result = await coordinateTrigger(prisma, makeEvent(), fn, res)
    assert.equal(result.resumedCount, 1)
    assert.equal(result.enqueuedCount, 1)
    assert.equal(resCalls.length, 1)
    assert.equal((resCalls[0] as unknown[]).length, 1)
  })

  it('throws AutomationDisabledError when workspace flag is off', async () => {
    const { AutomationDisabledError } = await import('../../automation/services/globalGuards.js')
    const prisma = makeCoordPrisma({ automationEnabled: false })
    const { fn } = makeEnqueue(); const { fn: res } = makeResume()
    await assert.rejects(
      () => coordinateTrigger(prisma, makeEvent(), fn, res),
      AutomationDisabledError,
    )
  })
})
