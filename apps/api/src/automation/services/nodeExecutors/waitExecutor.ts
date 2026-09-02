/**
 * WAIT node executor.
 *
 * Three wait kinds:
 *   DURATION  — sleep for N seconds → sets wakeAt = now + seconds
 *   UNTIL     — sleep until an ISO timestamp → sets wakeAt = isoTimestamp
 *   INPUT     — wait for the next inbound message from the contact
 *               Optional timeoutSeconds sets wakeAt for the timeout edge.
 *
 * The executor returns a signal to the engine (via wakeAt / waitingForInput).
 * The engine is responsible for updating instance status accordingly.
 */

import type { NodeExecutionContext, NodeExecutionResult } from './types.js'
import { TerminalError } from '../../types/index.js'

export async function executeWaitNode(nodeCtx: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { config } = nodeCtx

  if (config.nodeType !== 'WAIT') throw new TerminalError('waitExecutor called on non-WAIT node')

  const wait = config.wait

  switch (wait.kind) {
    case 'DURATION': {
      const wakeAt = new Date(Date.now() + wait.seconds * 1_000)
      return { nextEdgeLabel: 'default', wakeAt }
    }

    case 'UNTIL': {
      const wakeAt = new Date(wait.isoTimestamp)
      if (wakeAt <= new Date()) {
        // Already past — skip the wait and continue immediately
        return { nextEdgeLabel: 'default' }
      }
      return { nextEdgeLabel: 'default', wakeAt }
    }

    case 'INPUT': {
      const result: NodeExecutionResult = {
        nextEdgeLabel:   null, // engine will follow 'default' on resume
        waitingForInput: true,
      }
      if (wait.timeoutSeconds !== undefined) {
        result.wakeAt = new Date(Date.now() + wait.timeoutSeconds * 1_000)
      }
      return result
    }

    default: {
      const _never: never = wait
      throw new TerminalError(`Unknown wait kind: ${(_never as { kind: string }).kind}`)
    }
  }
}
