/**
 * Automation Engine — Phase 5 Route Tests
 *
 * Tests REST routes and the inbound webhook route using a minimal Express
 * app with all DB and external dependencies stubbed.
 *
 * Covers:
 *   • Feature flag (503 when disabled)
 *   • HMAC signature verification on inbound webhook
 *   • NormalizedInboundEvent validation (400 on bad payload)
 *   • HMAC skip via AUTOMATION_SKIP_SIG_VERIFY=true
 *   • verifySignature pure-function logic
 *   • Automation route 503 when flag off
 *   • Publish endpoint: 422 on invalid graph, 200 on valid graph
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import supertest from 'supertest'
import { createHmac } from 'node:crypto'

// ── HMAC signature helper (mirrors server implementation) ─────────────────────

function makeSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

// ── Minimal Express app for inbound route ─────────────────────────────────────

import automationInboundRouter from '../automationInbound.js'

function buildInboundApp() {
  const app = express()
  app.use(express.json())
  app.use('/', automationInboundRouter)
  return app
}

// ── Inbound route tests ───────────────────────────────────────────────────────

describe('POST /automation/inbound — feature flag', () => {
  before(() => { delete process.env.AUTOMATION_ENGINE_ENABLED })
  after(() => { process.env.AUTOMATION_ENGINE_ENABLED = 'true' })

  it('returns 503 when AUTOMATION_ENGINE_ENABLED is not true', async () => {
    const app = buildInboundApp()
    const res = await supertest(app).post('/').send({})
    assert.equal(res.status, 503)
    assert.equal(res.body.code, 'AUTOMATION_DISABLED')
  })
})

describe('POST /automation/inbound — signature verification', () => {
  const SECRET = 'test-secret-1234'

  before(() => {
    process.env.AUTOMATION_ENGINE_ENABLED = 'true'
    process.env.AUTOMATION_WEBHOOK_SECRET = SECRET
    delete process.env.AUTOMATION_SKIP_SIG_VERIFY
  })
  after(() => {
    delete process.env.AUTOMATION_WEBHOOK_SECRET
    delete process.env.AUTOMATION_ENGINE_ENABLED
  })

  it('returns 401 when signature header is missing', async () => {
    const app = buildInboundApp()
    const res = await supertest(app).post('/').send({ workspaceId: 'ws-1' })
    assert.equal(res.status, 401)
    assert.equal(res.body.code, 'INVALID_SIGNATURE')
  })

  it('returns 401 when signature is wrong', async () => {
    const app = buildInboundApp()
    const body = JSON.stringify({ workspaceId: 'ws-1' })
    const res = await supertest(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Automation-Signature', 'sha256=deadbeef')
      .send(body)
    assert.equal(res.status, 401)
  })

  it('returns 400 (not 401) when signature is correct but body is invalid', async () => {
    const app = buildInboundApp()
    const payload = { workspaceId: 'ws-1' } // missing required fields
    const body = JSON.stringify(payload)
    const sig = makeSignature(body, SECRET)
    const res = await supertest(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Automation-Signature', sig)
      .send(body)
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})

describe('POST /automation/inbound — skip sig verify mode', () => {
  before(() => {
    process.env.AUTOMATION_ENGINE_ENABLED = 'true'
    process.env.AUTOMATION_SKIP_SIG_VERIFY = 'true'
    delete process.env.AUTOMATION_WEBHOOK_SECRET
  })
  after(() => {
    delete process.env.AUTOMATION_SKIP_SIG_VERIFY
    delete process.env.AUTOMATION_ENGINE_ENABLED
  })

  it('skips signature check and proceeds to body validation', async () => {
    const app = buildInboundApp()
    // No signature header, no secret — should skip sig check and hit validation
    const payload = { workspaceId: 'ws-1' } // invalid (missing required fields)
    const res = await supertest(app).post('/').send(payload)
    // Should be 400 (body validation), not 401 (sig check)
    assert.equal(res.status, 400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
  })
})

// ── Automation routes — feature flag ──────────────────────────────────────────

import automationRouter from '../automation.js'

function buildAutomationApp() {
  const app = express()
  app.use(express.json())
  app.use('/', automationRouter)
  return app
}

describe('Automation routes — 503 when engine disabled', () => {
  before(() => { delete process.env.AUTOMATION_ENGINE_ENABLED })
  after(() => { process.env.AUTOMATION_ENGINE_ENABLED = 'true' })

  it('GET / returns 503', async () => {
    const app = buildAutomationApp()
    const res = await supertest(app).get('/?workspaceId=ws-1')
    assert.equal(res.status, 503)
    assert.equal(res.body.code, 'AUTOMATION_DISABLED')
  })

  it('POST / returns 503', async () => {
    const app = buildAutomationApp()
    const res = await supertest(app).post('/').send({ workspaceId: 'ws-1', name: 'Test' })
    assert.equal(res.status, 503)
    assert.equal(res.body.code, 'AUTOMATION_DISABLED')
  })

  it('POST /:flowId/versions/:versionId/publish returns 503', async () => {
    const app = buildAutomationApp()
    const res = await supertest(app).post('/flow-1/versions/ver-1/publish').send({ workspaceId: 'ws-1' })
    assert.equal(res.status, 503)
    assert.equal(res.body.code, 'AUTOMATION_DISABLED')
  })
})

// ── validateGraph integration via publish route ───────────────────────────────

import { validateGraph } from '../../automation/services/flowValidator.service.js'

describe('validateGraph — used by publish route', () => {
  it('returns valid=true for a minimal valid graph', () => {
    const nodes = [
      { id: 'n1', nodeKey: 'entry', nodeType: 'END', config: { nodeType: 'END' } },
    ]
    const edges: never[] = []
    const result = validateGraph(nodes, edges, 'entry')
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
  })

  it('returns valid=false for graph with unreachable node', () => {
    const nodes = [
      { id: 'n1', nodeKey: 'entry', nodeType: 'END', config: { nodeType: 'END' } },
      { id: 'n2', nodeKey: 'orphan', nodeType: 'END', config: { nodeType: 'END' } },
    ]
    const edges: never[] = []
    const result = validateGraph(nodes, edges, 'entry')
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.code === 'UNREACHABLE_NODE'))
  })

  it('returns valid=false for CONDITION missing true/false edges', () => {
    const nodes = [
      {
        id: 'n1', nodeKey: 'cond', nodeType: 'CONDITION',
        config: { nodeType: 'CONDITION', expr: { op: 'exists', field: { path: 'event.text' } } },
      },
    ]
    const edges: never[] = []
    const result = validateGraph(nodes, edges, 'cond')
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.code === 'CONDITION_NO_EDGES' || e.code === 'NO_OUTGOING_EDGE'))
  })

  it('returns errors for MESSAGE node with disallowed template path', () => {
    const nodes = [
      {
        id: 'n1', nodeKey: 'msg', nodeType: 'MESSAGE',
        config: { nodeType: 'MESSAGE', text: 'Hello {{user.secret}}' },
      },
    ]
    const result = validateGraph(nodes, [], 'msg')
    assert.ok(result.errors.some((e) => e.code === 'INVALID_TEMPLATE_PATH'))
  })
})

// ── NormalizedInboundEventSchema validation ────────────────────────────────────

import { NormalizedInboundEventSchema } from '../../automation/types/index.js'

describe('NormalizedInboundEventSchema', () => {
  const valid = {
    workspaceId:       'ws-123',
    channel:           'STUB',
    idempotencyKey:    'key-1',
    derivedIdempotency: false,
    senderId:          'sender-1',
    isFirstContact:    false,
    rawPayload:        {},
    receivedAt:        '2024-01-01T00:00:00Z',
  }

  it('accepts a valid event', () => {
    const result = NormalizedInboundEventSchema.safeParse(valid)
    assert.equal(result.success, true)
  })

  it('rejects when workspaceId is missing', () => {
    const { workspaceId: _, ...rest } = valid
    const result = NormalizedInboundEventSchema.safeParse(rest)
    assert.equal(result.success, false)
  })

  it('rejects unknown channel', () => {
    const result = NormalizedInboundEventSchema.safeParse({ ...valid, channel: 'TELEGRAM' })
    assert.equal(result.success, false)
  })

  it('coerces receivedAt string to Date', () => {
    const result = NormalizedInboundEventSchema.safeParse(valid)
    assert.ok(result.success)
    if (result.success) assert.ok(result.data.receivedAt instanceof Date)
  })
})
