/**
 * CONDITION node executor.
 *
 * Evaluates the ConditionExpr and selects the appropriate outgoing edge:
 *
 *   Boolean mode  (true/false edges present):
 *     → follows 'true' or 'false' based on evaluateCondition result.
 *
 *   Choice mode   (choice:* edges present):
 *     → tries each choice:<value> edge whose <value> equals the normalized
 *       event text / quickReplyValue; falls back to 'default' if present.
 *
 * Throws TerminalError if no matching edge can be found.
 */

import type { NodeExecutionContext, NodeExecutionResult } from './types.js'
import { evaluateCondition } from '../conditionEvaluator.js'
import { normalizeText } from '../conditionEvaluator.js'
import { TerminalError } from '../../types/index.js'

export async function executeConditionNode(nodeCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { node, config, evalCtx } = nodeCtx

  if (config.nodeType !== 'CONDITION') throw new TerminalError('conditionExecutor called on non-CONDITION node')

  const labels = node.outgoingEdges.map((e) => e.label)
  const hasBooleanEdges = labels.includes('true') || labels.includes('false')
  const hasChoiceEdges  = labels.some((l) => l.startsWith('choice:'))

  if (hasBooleanEdges) {
    // Boolean mode: evaluate condition and pick true/false edge
    const result = evaluateCondition(config.expr, evalCtx)
    const edgeLabel = result ? 'true' : 'false'
    if (!labels.includes(edgeLabel)) {
      throw new TerminalError(`CONDITION node "${node.nodeKey}" missing "${edgeLabel}" edge`)
    }
    return { nextEdgeLabel: edgeLabel }
  }

  if (hasChoiceEdges) {
    // Choice mode: match quick-reply value or normalised text
    const input = normalizeText(
      evalCtx.event.quickReplyValue ?? evalCtx.event.text ?? '',
    )
    const matchedEdge = node.outgoingEdges.find(
      (e) => e.label.startsWith('choice:') && normalizeText(e.label.slice('choice:'.length)) === input,
    )
    if (matchedEdge) return { nextEdgeLabel: matchedEdge.label }

    // Fall back to default
    if (labels.includes('default')) return { nextEdgeLabel: 'default' }

    throw new TerminalError(
      `CONDITION node "${node.nodeKey}" in choice mode: no matching edge for input "${input}" and no default edge`,
    )
  }

  throw new TerminalError(`CONDITION node "${node.nodeKey}" has no boolean or choice edges`)
}
