/**
 * Automation Engine — Flow Graph Validator
 *
 * Validates a graph (nodes + edges) without touching the database.
 * Returns { errors, warnings }. Callers should reject publication if
 * errors.length > 0; warnings are informational only.
 *
 * Checks:
 *   1. Exactly one entry node (matches entryNodeKey).
 *   2. Every node is reachable from the entry node.
 *   3. Every non-END node has at least one outgoing edge.
 *   4. CONDITION edge-label completeness:
 *      - boolean mode: must have 'true' and 'false' edges (plus optional others).
 *      - choice mode: must have at least one 'choice:*' edge + optional 'default'.
 *      - No mixing of boolean and choice modes.
 *   5. WAIT/INPUT with timeoutSeconds must have a 'timeout' edge.
 *   6. No dangling edge targets (target nodeKey must exist).
 *   7. Cycle detection — warn if a cycle exists that does not pass through a WAIT.
 *   8. Per-node Zod validation of config.
 *   9. Template-path validation in MESSAGE.text.
 *  10. Unknown nodeType → error.
 *  11. Operator nesting > 8 in CONDITION → error.
 */

import { NodeConfigSchema, EdgeLabelSchema, validateTemplatePaths, ValidationResult, ValidationIssue } from '../types/index.js'
import { checkConditionDepth } from './conditionEvaluator.js'

export interface GraphNode {
  id: string
  nodeKey: string
  nodeType: string
  config: unknown
}

export interface GraphEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  label: string
}

export function validateGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  entryNodeKey: string,
): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  function err(code: string, message: string, nodeKey?: string, edgeId?: string): void {
    errors.push({ nodeKey, edgeId, code, message })
  }
  function warn(code: string, message: string, nodeKey?: string, edgeId?: string): void {
    warnings.push({ nodeKey, edgeId, code, message })
  }

  // Build lookup maps
  const nodeById   = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]))
  const nodeByKey  = new Map<string, GraphNode>(nodes.map((n) => [n.nodeKey, n]))
  const outEdges   = new Map<string, GraphEdge[]>()
  const inEdges    = new Map<string, GraphEdge[]>()

  for (const node of nodes) {
    outEdges.set(node.id, [])
    inEdges.set(node.id, [])
  }

  // ── 6. Dangling edge targets ────────────────────────────────────────────────
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceNodeId)) {
      err('DANGLING_SOURCE', `Edge ${edge.id} source nodeId "${edge.sourceNodeId}" not found`, undefined, edge.id)
    }
    if (!nodeById.has(edge.targetNodeId)) {
      err('DANGLING_TARGET', `Edge ${edge.id} target nodeId "${edge.targetNodeId}" not found`, undefined, edge.id)
    }
    outEdges.get(edge.sourceNodeId)?.push(edge)
    inEdges.get(edge.targetNodeId)?.push(edge)
  }

  // ── 1. Entry node exists ───────────────────────────────────────────────────
  const entryNode = nodeByKey.get(entryNodeKey)
  if (!entryNode) {
    err('NO_ENTRY_NODE', `Entry node "${entryNodeKey}" not found in graph`)
    // Cannot proceed with reachability without a valid entry node
    return { valid: errors.length === 0, errors, warnings }
  }

  // ── 2. Reachability (BFS from entry) ──────────────────────────────────────
  const reachable = new Set<string>()
  const queue: string[] = [entryNode.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const edge of (outEdges.get(id) ?? [])) {
      if (!reachable.has(edge.targetNodeId)) queue.push(edge.targetNodeId)
    }
  }
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      err('UNREACHABLE_NODE', `Node "${node.nodeKey}" is not reachable from entry node`, node.nodeKey)
    }
  }

  // ── Per-node validation ────────────────────────────────────────────────────
  for (const node of nodes) {
    const nodeOuts = outEdges.get(node.id) ?? []

    // ── 8. Zod config validation ───────────────────────────────────────────
    const parsed = NodeConfigSchema.safeParse(node.config)
    if (!parsed.success) {
      err(
        'INVALID_NODE_CONFIG',
        `Node "${node.nodeKey}" config invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        node.nodeKey,
      )
      // Cannot do deeper per-type checks without a valid config
      continue
    }
    const config = parsed.data

    // ── 10. Unknown node type (caught by Zod above, but double-check) ──────
    // Already handled — NodeConfigSchema discriminates on nodeType.

    // ── 3. Non-END node must have outgoing edges ───────────────────────────
    if (config.nodeType !== 'END' && nodeOuts.length === 0) {
      err('NO_OUTGOING_EDGE', `Non-END node "${node.nodeKey}" has no outgoing edges`, node.nodeKey)
    }

    if (config.nodeType === 'MESSAGE') {
      // ── 9. Template path validation ─────────────────────────────────────
      const invalidPaths = validateTemplatePaths(config.text)
      if (invalidPaths.length > 0) {
        err(
          'INVALID_TEMPLATE_PATH',
          `Node "${node.nodeKey}" MESSAGE.text uses disallowed template paths: ${invalidPaths.join(', ')}`,
          node.nodeKey,
        )
      }
      if (config.quickReplies && config.quickReplies.length > 0 && nodeOuts.length === 0) {
        warn('QUICK_REPLY_NO_CHOICE_EDGE', `Node "${node.nodeKey}" has quick replies but no choice: edges — replies will not route`, node.nodeKey)
      }
    }

    if (config.nodeType === 'CONDITION') {
      // ── 4. CONDITION edge-label completeness ────────────────────────────
      const labels = nodeOuts.map((e) => e.label)
      const hasBooleanEdges = labels.includes('true') || labels.includes('false')
      const hasChoiceEdges  = labels.some((l) => l.startsWith('choice:'))

      if (hasBooleanEdges && hasChoiceEdges) {
        err('CONDITION_MIXED_MODES', `Node "${node.nodeKey}" CONDITION mixes boolean (true/false) and choice: edges`, node.nodeKey)
      } else if (hasBooleanEdges) {
        if (!labels.includes('true'))  err('CONDITION_MISSING_TRUE',  `Node "${node.nodeKey}" CONDITION missing "true" edge`,  node.nodeKey)
        if (!labels.includes('false')) err('CONDITION_MISSING_FALSE', `Node "${node.nodeKey}" CONDITION missing "false" edge`, node.nodeKey)
      } else if (hasChoiceEdges) {
        // choice mode — must have at least one choice: edge (already true) + optional default
        if (!labels.includes('default')) {
          warn('CONDITION_NO_DEFAULT_EDGE', `Node "${node.nodeKey}" CONDITION in choice mode has no "default" edge — unmatched inputs will error`, node.nodeKey)
        }
      } else {
        err('CONDITION_NO_EDGES', `Node "${node.nodeKey}" CONDITION has no true/false or choice: edges`, node.nodeKey)
      }

      // ── 11. Operator nesting depth ────────────────────────────────────
      try {
        checkConditionDepth(config.expr)
      } catch {
        err('CONDITION_DEPTH_EXCEEDED', `Node "${node.nodeKey}" condition nesting exceeds maximum depth of 8`, node.nodeKey)
      }
    }

    if (config.nodeType === 'WAIT') {
      // ── 5. WAIT/INPUT with timeout must have a 'timeout' edge ────────────
      if (config.wait.kind === 'INPUT' && config.wait.timeoutSeconds !== undefined) {
        const hasTimeout = nodeOuts.some((e) => e.label === 'timeout')
        if (!hasTimeout) {
          err(
            'WAIT_MISSING_TIMEOUT_EDGE',
            `Node "${node.nodeKey}" WAIT/INPUT has timeoutSeconds but no "timeout" edge`,
            node.nodeKey,
          )
        }
      }
    }

    // ── Edge label validation ──────────────────────────────────────────────
    for (const edge of nodeOuts) {
      const labelParsed = EdgeLabelSchema.safeParse(edge.label)
      if (!labelParsed.success) {
        err('INVALID_EDGE_LABEL', `Edge "${edge.id}" from "${node.nodeKey}" has invalid label "${edge.label}"`, node.nodeKey, edge.id)
      }
    }
  }

  // ── 7. Cycle detection ─────────────────────────────────────────────────────
  // DFS-based cycle detection. Warn if a cycle exists without a WAIT node on the path.
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]))

  function dfs(id: string, pathHasWait: boolean): void {
    color.set(id, GRAY)
    const node = nodeById.get(id)!
    const nodeIsWait = node.nodeType === 'WAIT'
    for (const edge of (outEdges.get(id) ?? [])) {
      const c = color.get(edge.targetNodeId)
      if (c === GRAY) {
        // Back edge → cycle
        if (!pathHasWait && !nodeIsWait) {
          warn(
            'CYCLE_WITHOUT_WAIT',
            `Cycle detected involving node "${node.nodeKey}" — cycles must pass through a WAIT node`,
            node.nodeKey,
            edge.id,
          )
        }
      } else if (c === WHITE) {
        dfs(edge.targetNodeId, pathHasWait || nodeIsWait)
      }
    }
    color.set(id, BLACK)
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) dfs(node.id, false)
  }

  return { valid: errors.length === 0, errors, warnings }
}
