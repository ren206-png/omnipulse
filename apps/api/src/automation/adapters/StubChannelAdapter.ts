/**
 * Automation Engine — Stub Channel Adapter
 *
 * Used in tests and local development. Records every send call in memory.
 * Never throws unless `shouldFail` is set.
 */

import type { IChannelAdapter, SendMessagePayload } from './IChannelAdapter.js'
import { RetryableError, TerminalError } from '../types/index.js'

export type StubFailMode = 'none' | 'retryable' | 'terminal'

export class StubChannelAdapter implements IChannelAdapter {
  readonly channel = 'STUB' as const

  readonly sent: SendMessagePayload[] = []
  private failMode: StubFailMode = 'none'
  private failAfter = 0
  private sendCount = 0

  /** Configure adapter to fail on the next N calls. */
  setFailMode(mode: StubFailMode, times = 1): this {
    this.failMode = mode
    this.failAfter = times
    return this
  }

  async send(payload: SendMessagePayload): Promise<void> {
    this.sendCount++
    if (this.failAfter > 0) {
      this.failAfter--
      switch (this.failMode) {
        case 'retryable': throw new RetryableError(`StubAdapter: simulated retryable failure (send #${this.sendCount})`)
        case 'terminal':  throw new TerminalError(`StubAdapter: simulated terminal failure (send #${this.sendCount})`)
        default: break
      }
    }
    this.sent.push({ ...payload })
  }

  reset(): this {
    this.sent.length = 0
    this.failMode = 'none'
    this.failAfter = 0
    this.sendCount = 0
    return this
  }
}
