/**
 * Phase 1 Tests — Zod schemas, condition evaluator, flow validator.
 *
 * Run: npx tsx --test src/routes/__tests__/automation.validator.test.ts
 *
 * Covers acceptance criteria:
 *   1. Keyword normalisation (case, whitespace, Unicode NFKC)
 *   4. CONDITION routing: true, false, choice, default, missing-edge terminal failure
 *  10. Validator rejects: unreachable nodes, dangling edges, cycle without WAIT,
 *      unknown node type, disallowed template path, disallowed operator, nesting > 8
 */

import { strict as assert } from 'node:assert'
import { test, describe } from 'node:test'

import { normalizeText, evaluateCondition, checkConditionDepth } from '../../automation/services/conditionEvaluator.js'
import { validateGraph, type GraphNode, type GraphEdge } from '../../automation/services/flowValidator.service.js'
import {
  NodeConfigSchema,
  TriggerConfigSchema,
  ConditionExprSchema,
  ActionPayloadSchema,
  EdgeLabelSchema,
  NormalizedInboundEventSchema,
  RetryableError,
  TerminalError,
  isRetryable,
  type EvalContext,
  type ConditionExpr,
} from '../../automation/types/index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  nodeKey: string,
  nodeType: string,
  config: unknown,
): GraphNode {
  return { id, nodeKey, nodeType, config }
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  label: string,
): GraphEdge {
  return { id, sourceNodeId, targetNodeId, label }
}

const baseCtx: EvalContext = {
  contact: { firstName: 'Alice', channel: 'INSTAGRAM', optedOut: false, fields: {}, tags: [] },
  ctx:     {},
  event:   { text: 'hello world' },
}

// ─── 1. Text normalisation ───────────────────────────────────────────────────

describe('normalizeText', () => {
  test('trims surrounding whitespace', () => {
    assert.equal(normalizeText('  hello  '), 'hello')
  })

  test('lowercases ASCII', () => {
    assert.equal(normalizeText('HELLO'), 'hello')
  })

  test('collapses internal whitespace', () => {
    assert.equal(normalizeText('hello   world'), 'hello world')
  })

  test('NFKC: normalises full-width characters', () => {
    // Full-width 'ＡＢＣＤ' (U+FF21..U+FF24) → 'abcd' after NFKC + lower
    const fullWidth = 'ＡＢＣＤ'
    assert.equal(normalizeText(fullWidth), 'abcd')
  })

  test('NFKC: decomposes ligature fi', () => {
    // ﬁ (U+FB01) → 'fi' after NFKC
    assert.equal(normalizeText('ﬁnd'), 'find')
  })

  test('keyword matching is case-insensitive', () => {
    assert.equal(normalizeText('STOP'), normalizeText('stop'))
    assert.equal(normalizeText('UnSuBsCrIbE'), normalizeText('unsubscribe'))
  })
})

// ─── Zod schema tests ────────────────────────────────────────────────────────

describe('TriggerConfigSchema', () => {
  test('accepts valid KEYWORD trigger', () => {
    const r = TriggerConfigSchema.safeParse({ type: 'KEYWORD', keywords: ['HELP', 'hello'] })
    assert.ok(r.success)
  })

  test('rejects KEYWORD trigger with empty keywords array', () => {
    const r = TriggerConfigSchema.safeParse({ type: 'KEYWORD', keywords: [] })
    assert.ok(!r.success)
  })

  test('accepts FIRST_CONTACT trigger', () => {
    const r = TriggerConfigSchema.safeParse({ type: 'FIRST_CONTACT' })
    assert.ok(r.success)
  })

  test('accepts WEBHOOK_EVENT trigger', () => {
    const r = TriggerConfigSchema.safeParse({ type: 'WEBHOOK_EVENT', eventType: 'job.booked' })
    assert.ok(r.success)
  })

  test('rejects unknown trigger type', () => {
    const r = TriggerConfigSchema.safeParse({ type: 'UNKNOWN_TRIGGER' })
    assert.ok(!r.success)
  })
})

describe('NodeConfigSchema', () => {
  test('accepts valid MESSAGE node', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'MESSAGE', text: 'Hello {{contact.firstName}}!' })
    assert.ok(r.success)
  })

  test('rejects MESSAGE node with empty text', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'MESSAGE', text: '' })
    assert.ok(!r.success)
  })

  test('accepts CONDITION node', () => {
    const r = NodeConfigSchema.safeParse({
      nodeType: 'CONDITION',
      expr: { op: 'equals', field: { path: 'contact.firstName' }, value: 'Alice' },
    })
    assert.ok(r.success)
  })

  test('accepts ACTION ADD_TAG', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'ACTION', action: { action: 'ADD_TAG', tag: 'vip' } })
    assert.ok(r.success)
  })

  test('accepts SET_CONTACT_FIELD action with valid key', () => {
    const r = NodeConfigSchema.safeParse({
      nodeType: 'ACTION',
      action: { action: 'SET_CONTACT_FIELD', key: 'score', value: 42 },
    })
    assert.ok(r.success)
  })

  test('rejects SET_CONTACT_FIELD action with invalid key (starts with digit)', () => {
    const r = NodeConfigSchema.safeParse({
      nodeType: 'ACTION',
      action: { action: 'SET_CONTACT_FIELD', key: '1score', value: 42 },
    })
    assert.ok(!r.success)
  })

  test('accepts WAIT INPUT node', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'WAIT', wait: { kind: 'INPUT', timeoutSeconds: 300 } })
    assert.ok(r.success)
  })

  test('accepts WAIT DURATION node', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'WAIT', wait: { kind: 'DURATION', seconds: 3600 } })
    assert.ok(r.success)
  })

  test('accepts END node', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'END', outcome: 'converted' })
    assert.ok(r.success)
  })

  test('rejects unknown node type', () => {
    const r = NodeConfigSchema.safeParse({ nodeType: 'UNKNOWN', config: {} })
    assert.ok(!r.success)
  })
})

describe('EdgeLabelSchema', () => {
  for (const label of ['default', 'true', 'false', 'timeout', 'error', 'choice:yes', 'choice:option_1']) {
    test(`accepts valid label: "${label}"`, () => {
      assert.ok(EdgeLabelSchema.safeParse(label).success)
    })
  }
  test('rejects bare "choice" without colon+value', () => {
    assert.ok(!EdgeLabelSchema.safeParse('choice').success)
  })
  test('rejects arbitrary string', () => {
    assert.ok(!EdgeLabelSchema.safeParse('banana').success)
  })
})

describe('ConditionExprSchema', () => {
  test('accepts simple equals', () => {
    const r = ConditionExprSchema.safeParse({ op: 'equals', field: { path: 'event.text' }, value: 'hello' })
    assert.ok(r.success)
  })

  test('accepts nested and/or', () => {
    const r = ConditionExprSchema.safeParse({
      op: 'and',
      conditions: [
        { op: 'hasTag', tag: 'vip' },
        { op: 'gt', field: { path: 'ctx.score' }, value: 5 },
      ],
    })
    assert.ok(r.success)
  })

  test('rejects field path not in allowlist', () => {
    const r = ConditionExprSchema.safeParse({ op: 'equals', field: { path: 'contact.email' }, value: 'x' })
    assert.ok(!r.success)
  })

  test('rejects unknown operator', () => {
    const r = ConditionExprSchema.safeParse({ op: 'regex', field: { path: 'event.text' }, pattern: '.*' })
    assert.ok(!r.success)
  })
})

// ─── 4. Condition evaluator ──────────────────────────────────────────────────

describe('evaluateCondition — basic operators', () => {
  test('equals string (normalised, case-insensitive)', () => {
    const ctx: EvalContext = { ...baseCtx, event: { text: 'Hello World' } }
    assert.equal(
      evaluateCondition({ op: 'equals', field: { path: 'event.text' }, value: 'hello world' }, ctx),
      true,
    )
  })

  test('notEquals', () => {
    assert.equal(
      evaluateCondition({ op: 'notEquals', field: { path: 'contact.firstName' }, value: 'Bob' }, baseCtx),
      true,
    )
  })

  test('contains', () => {
    const ctx: EvalContext = { ...baseCtx, event: { text: 'buy now please' } }
    assert.equal(
      evaluateCondition({ op: 'contains', field: { path: 'event.text' }, value: 'buy now' }, ctx),
      true,
    )
  })

  test('startsWith', () => {
    const ctx: EvalContext = { ...baseCtx, event: { text: 'HELP me please' } }
    assert.equal(
      evaluateCondition({ op: 'startsWith', field: { path: 'event.text' }, value: 'help' }, ctx),
      true,
    )
  })

  test('exists returns true for non-empty field', () => {
    assert.equal(
      evaluateCondition({ op: 'exists', field: { path: 'contact.firstName' } }, baseCtx),
      true,
    )
  })

  test('exists returns false for missing field', () => {
    const ctx: EvalContext = { ...baseCtx, contact: { ...baseCtx.contact, firstName: undefined } }
    assert.equal(
      evaluateCondition({ op: 'exists', field: { path: 'contact.firstName' } }, ctx),
      false,
    )
  })

  test('in matches one of many values', () => {
    const ctx: EvalContext = { ...baseCtx, event: { text: 'yes' } }
    assert.equal(
      evaluateCondition({ op: 'in', field: { path: 'event.text' }, values: ['yes', 'no', 'maybe'] }, ctx),
      true,
    )
  })

  test('hasTag true', () => {
    const ctx: EvalContext = { ...baseCtx, contact: { ...baseCtx.contact, tags: ['VIP', 'beta'] } }
    assert.equal(evaluateCondition({ op: 'hasTag', tag: 'vip' }, ctx), true)
  })

  test('hasTag false', () => {
    assert.equal(evaluateCondition({ op: 'hasTag', tag: 'vip' }, baseCtx), false)
  })

  test('gt true', () => {
    const ctx: EvalContext = { ...baseCtx, ctx: { score: 10 } }
    assert.equal(evaluateCondition({ op: 'gt', field: { path: 'ctx.score' }, value: 5 }, ctx), true)
  })

  test('lt true', () => {
    const ctx: EvalContext = { ...baseCtx, ctx: { score: 3 } }
    assert.equal(evaluateCondition({ op: 'lt', field: { path: 'ctx.score' }, value: 5 }, ctx), true)
  })
})

describe('evaluateCondition — compound operators', () => {
  test('and: both true', () => {
    const expr: ConditionExpr = {
      op: 'and',
      conditions: [
        { op: 'equals', field: { path: 'contact.firstName' }, value: 'alice' },
        { op: 'exists', field: { path: 'contact.firstName' } },
      ],
    }
    assert.equal(evaluateCondition(expr, baseCtx), true)
  })

  test('and: one false', () => {
    const expr: ConditionExpr = {
      op: 'and',
      conditions: [
        { op: 'equals', field: { path: 'contact.firstName' }, value: 'alice' },
        { op: 'hasTag', tag: 'vip' },
      ],
    }
    assert.equal(evaluateCondition(expr, baseCtx), false)
  })

  test('or: one true', () => {
    const expr: ConditionExpr = {
      op: 'or',
      conditions: [
        { op: 'hasTag', tag: 'vip' },
        { op: 'equals', field: { path: 'contact.firstName' }, value: 'alice' },
      ],
    }
    assert.equal(evaluateCondition(expr, baseCtx), true)
  })

  test('not: negates true', () => {
    const expr: ConditionExpr = {
      op: 'not',
      condition: { op: 'hasTag', tag: 'vip' },
    }
    assert.equal(evaluateCondition(expr, baseCtx), true)
  })
})

describe('evaluateCondition — depth limit', () => {
  function buildNested(depth: number): ConditionExpr {
    let expr: ConditionExpr = { op: 'hasTag', tag: 'x' }
    for (let i = 0; i < depth; i++) {
      expr = { op: 'not', condition: expr }
    }
    return expr
  }

  test('depth 8 is allowed', () => {
    assert.doesNotThrow(() => evaluateCondition(buildNested(8), baseCtx))
  })

  test('depth 9 throws', () => {
    assert.throws(() => evaluateCondition(buildNested(9), baseCtx), /depth/)
  })
})

// ─── 10. Flow validator ──────────────────────────────────────────────────────

describe('validateGraph — valid graphs', () => {
  test('minimal valid graph: entry → END', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'entry', 'END', { nodeType: 'END' }),
    ]
    const result = validateGraph(nodes, [], 'entry')
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  test('MESSAGE → END valid graph', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'msg', 'MESSAGE', { nodeType: 'MESSAGE', text: 'Hello!' }),
      makeNode('n2', 'done', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'n2', 'default')]
    const result = validateGraph(nodes, edges, 'msg')
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  test('CONDITION with true/false edges', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: { op: 'hasTag', tag: 'vip' } }),
      makeNode('n2', 'yes', 'END', { nodeType: 'END', outcome: 'vip' }),
      makeNode('n3', 'no', 'END', { nodeType: 'END', outcome: 'standard' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'true'),
      makeEdge('e2', 'n1', 'n3', 'false'),
    ]
    const result = validateGraph(nodes, edges, 'cond')
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  test('CONDITION with choice: edges + default', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: { op: 'hasTag', tag: 'x' } }),
      makeNode('n2', 'a', 'END', { nodeType: 'END' }),
      makeNode('n3', 'b', 'END', { nodeType: 'END' }),
      makeNode('n4', 'def', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'choice:optionA'),
      makeEdge('e2', 'n1', 'n3', 'choice:optionB'),
      makeEdge('e3', 'n1', 'n4', 'default'),
    ]
    const result = validateGraph(nodes, edges, 'cond')
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  test('WAIT INPUT with timeout edge', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'wait', 'WAIT', { nodeType: 'WAIT', wait: { kind: 'INPUT', timeoutSeconds: 300 } }),
      makeNode('n2', 'ok', 'END', { nodeType: 'END' }),
      makeNode('n3', 'timeout', 'END', { nodeType: 'END', outcome: 'timed_out' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'default'),
      makeEdge('e2', 'n1', 'n3', 'timeout'),
    ]
    const result = validateGraph(nodes, edges, 'wait')
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })
})

describe('validateGraph — error cases', () => {
  test('rejects unknown entry node key', () => {
    const nodes: GraphNode[] = [makeNode('n1', 'msg', 'END', { nodeType: 'END' })]
    const result = validateGraph(nodes, [], 'nonexistent')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'NO_ENTRY_NODE'))
  })

  test('rejects unreachable node', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'entry', 'END', { nodeType: 'END' }),
      makeNode('n2', 'orphan', 'END', { nodeType: 'END' }),
    ]
    const result = validateGraph(nodes, [], 'entry')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'UNREACHABLE_NODE' && e.nodeKey === 'orphan'))
  })

  test('rejects dangling edge target', () => {
    const nodes: GraphNode[] = [makeNode('n1', 'entry', 'MESSAGE', { nodeType: 'MESSAGE', text: 'hi' })]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'NOTANODE', 'default')]
    const result = validateGraph(nodes, edges, 'entry')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'DANGLING_TARGET'))
  })

  test('rejects non-END node with no outgoing edges', () => {
    const nodes: GraphNode[] = [makeNode('n1', 'msg', 'MESSAGE', { nodeType: 'MESSAGE', text: 'hi' })]
    const result = validateGraph(nodes, [], 'msg')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'NO_OUTGOING_EDGE'))
  })

  test('rejects CONDITION missing true edge', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: { op: 'hasTag', tag: 'x' } }),
      makeNode('n2', 'end', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'n2', 'false')]
    const result = validateGraph(nodes, edges, 'cond')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'CONDITION_MISSING_TRUE'))
  })

  test('rejects CONDITION missing false edge', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: { op: 'hasTag', tag: 'x' } }),
      makeNode('n2', 'end', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'n2', 'true')]
    const result = validateGraph(nodes, edges, 'cond')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'CONDITION_MISSING_FALSE'))
  })

  test('rejects CONDITION mixing boolean and choice modes', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: { op: 'hasTag', tag: 'x' } }),
      makeNode('n2', 'a', 'END', { nodeType: 'END' }),
      makeNode('n3', 'b', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'true'),
      makeEdge('e2', 'n1', 'n3', 'choice:yes'),
    ]
    const result = validateGraph(nodes, edges, 'cond')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'CONDITION_MIXED_MODES'))
  })

  test('rejects WAIT INPUT with timeoutSeconds but no timeout edge', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'wait', 'WAIT', { nodeType: 'WAIT', wait: { kind: 'INPUT', timeoutSeconds: 300 } }),
      makeNode('n2', 'end', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'n2', 'default')]
    const result = validateGraph(nodes, edges, 'wait')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'WAIT_MISSING_TIMEOUT_EDGE'))
  })

  test('rejects MESSAGE node with disallowed template path', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'msg', 'MESSAGE', { nodeType: 'MESSAGE', text: 'Your email: {{contact.email}}' }),
      makeNode('n2', 'end', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [makeEdge('e1', 'n1', 'n2', 'default')]
    const result = validateGraph(nodes, edges, 'msg')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'INVALID_TEMPLATE_PATH'))
  })

  test('rejects invalid node config (unknown nodeType)', () => {
    const nodes: GraphNode[] = [
      makeNode('n1', 'mystery', 'MYSTERY_TYPE', { nodeType: 'MYSTERY_TYPE', something: true }),
    ]
    const result = validateGraph(nodes, [], 'mystery')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'INVALID_NODE_CONFIG'))
  })

  test('rejects condition nesting > 8', () => {
    function nested(d: number): object {
      if (d === 0) return { op: 'hasTag', tag: 'x' }
      return { op: 'not', condition: nested(d - 1) }
    }
    const nodes: GraphNode[] = [
      makeNode('n1', 'cond', 'CONDITION', { nodeType: 'CONDITION', expr: nested(9) }),
      makeNode('n2', 'end', 'END', { nodeType: 'END' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'true'),
      makeEdge('e2', 'n1', 'n2', 'false'),
    ]
    const result = validateGraph(nodes, edges, 'cond')
    assert.ok(!result.valid)
    assert.ok(result.errors.some((e) => e.code === 'CONDITION_DEPTH_EXCEEDED'), JSON.stringify(result.errors))
  })
})

describe('validateGraph — cycle warnings', () => {
  test('cycle through WAIT node does not warn', () => {
    // msg → wait → msg (cycle through WAIT = allowed)
    const nodes: GraphNode[] = [
      makeNode('n1', 'msg', 'MESSAGE', { nodeType: 'MESSAGE', text: 'hi' }),
      makeNode('n2', 'wait', 'WAIT', { nodeType: 'WAIT', wait: { kind: 'INPUT' } }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'default'),
      makeEdge('e2', 'n2', 'n1', 'default'),
    ]
    const result = validateGraph(nodes, edges, 'msg')
    const cycleWarns = result.warnings.filter((w) => w.code === 'CYCLE_WITHOUT_WAIT')
    assert.equal(cycleWarns.length, 0, JSON.stringify(result.warnings))
  })

  test('cycle without WAIT emits warning', () => {
    // msg1 → msg2 → msg1 (no WAIT — warning)
    const nodes: GraphNode[] = [
      makeNode('n1', 'msg1', 'MESSAGE', { nodeType: 'MESSAGE', text: 'a' }),
      makeNode('n2', 'msg2', 'MESSAGE', { nodeType: 'MESSAGE', text: 'b' }),
    ]
    const edges: GraphEdge[] = [
      makeEdge('e1', 'n1', 'n2', 'default'),
      makeEdge('e2', 'n2', 'n1', 'default'),
    ]
    const result = validateGraph(nodes, edges, 'msg1')
    assert.ok(result.warnings.some((w) => w.code === 'CYCLE_WITHOUT_WAIT'), JSON.stringify(result.warnings))
  })
})

// ─── Error classification ────────────────────────────────────────────────────

describe('RetryableError / TerminalError / isRetryable', () => {
  test('RetryableError is retryable', () => {
    assert.equal(isRetryable(new RetryableError('network glitch')), true)
  })

  test('TerminalError is not retryable', () => {
    assert.equal(isRetryable(new TerminalError('bad config')), false)
  })

  test('ECONNREFUSED Error is retryable', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    assert.equal(isRetryable(err), true)
  })

  test('plain Error is not retryable by default', () => {
    assert.equal(isRetryable(new Error('validation error')), false)
  })
})

// ─── NormalizedInboundEvent schema ───────────────────────────────────────────

describe('NormalizedInboundEventSchema', () => {
  test('accepts valid event', () => {
    const r = NormalizedInboundEventSchema.safeParse({
      workspaceId:        'ws_123',
      channel:            'INSTAGRAM',
      idempotencyKey:     'abc123',
      derivedIdempotency: false,
      senderId:           'psid_456',
      text:               'hello',
      normalizedText:     'hello',
      rawPayload:         { messaging: [] },
      receivedAt:         new Date().toISOString(),
    })
    assert.ok(r.success, JSON.stringify(r))
  })

  test('rejects unknown channel', () => {
    const r = NormalizedInboundEventSchema.safeParse({
      workspaceId: 'ws', channel: 'TWITTER', idempotencyKey: 'k',
      derivedIdempotency: false, senderId: 's', rawPayload: {}, receivedAt: new Date(),
    })
    assert.ok(!r.success)
  })
})
