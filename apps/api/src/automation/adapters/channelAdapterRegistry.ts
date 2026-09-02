/**
 * Automation Engine — Channel Adapter Registry
 *
 * Maps AutomationChannel → IChannelAdapter at runtime.
 * Adapters are registered once at app startup and looked up per outbox job.
 *
 * Default: STUB adapter is always registered for tests / local dev.
 * Production code registers Meta adapters per workspace access token via
 * registerWorkspaceAdapters().
 */

import type { AutomationChannel } from '../types/index.js'
import type { IChannelAdapter } from './IChannelAdapter.js'
import { StubChannelAdapter } from './StubChannelAdapter.js'

class ChannelAdapterRegistry {
  private readonly adapters = new Map<AutomationChannel, IChannelAdapter>()

  constructor() {
    // Always register the stub adapter for tests and local dev
    this.register(new StubChannelAdapter())
  }

  register(adapter: IChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter)
  }

  /**
   * Get the adapter for a channel.
   * @throws if no adapter is registered for the channel.
   */
  get(channel: AutomationChannel): IChannelAdapter {
    const adapter = this.adapters.get(channel)
    if (!adapter) {
      throw new Error(`No channel adapter registered for "${channel}"`)
    }
    return adapter
  }

  has(channel: AutomationChannel): boolean {
    return this.adapters.has(channel)
  }
}

/** Singleton registry — import and use directly. */
export const channelAdapterRegistry = new ChannelAdapterRegistry()
