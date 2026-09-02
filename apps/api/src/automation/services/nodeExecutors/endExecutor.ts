/**
 * END node executor.
 *
 * Terminal node — returns nextEdgeLabel: null to signal the engine to
 * mark the instance COMPLETED.
 */

import type { NodeExecutionContext, NodeExecutionResult } from './types.js'
import { TerminalError } from '../../types/index.js'

export async function executeEndNode(nodeCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { config } = nodeCtx

  if (config.nodeType !== 'END') throw new TerminalError('endExecutor called on non-END node')

  return { nextEdgeLabel: null }
}
