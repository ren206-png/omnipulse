/**
 * Automation Engine — Meta Channel Adapter (skeleton)
 *
 * Handles Facebook Messenger, Instagram DM, and WhatsApp Business API sends.
 * This is a skeleton implementation for Phase 4 wiring. Full platform API
 * integration will be completed in a later phase alongside the existing
 * social-account OAuth infrastructure.
 *
 * At runtime, the adapter looks up the workspace's page access token from
 * the SocialAccount table and calls the appropriate Graph API endpoint.
 *
 * Error mapping:
 *   HTTP 4xx (except 429) → TerminalError
 *   HTTP 429 / 5xx        → RetryableError
 *   Network errors        → RetryableError
 */

import type { IChannelAdapter, SendMessagePayload } from './IChannelAdapter.js'
import type { AutomationChannel } from '../types/index.js'
import { RetryableError, TerminalError } from '../types/index.js'

export class MetaChannelAdapter implements IChannelAdapter {
  constructor(
    readonly channel: Extract<AutomationChannel, 'FACEBOOK' | 'INSTAGRAM' | 'WHATSAPP'>,
    /** Page Access Token for this workspace + channel. Injected at construction time. */
    private readonly accessToken: string,
  ) {}

  async send(payload: SendMessagePayload): Promise<void> {
    // Skeleton — replace with real Graph API call in Phase 5+.
    void payload

    // Illustrative error-mapping pattern:
    //   if (res.status === 429) throw new RetryableError('Meta API rate-limited')
    //   if (res.status >= 500) throw new RetryableError(`Meta API ${res.status}`)
    //   if (!res.ok)           throw new TerminalError(`Meta API error ${res.status}`)

    throw new TerminalError(
      `MetaChannelAdapter.send: real platform integration not yet implemented for channel "${this.channel}"`,
    )
  }
}

/**
 * Factory: construct the correct Meta adapter for the given channel.
 * Throws if channel is not a Meta channel.
 */
export function createMetaAdapter(
  channel: AutomationChannel,
  accessToken: string,
): MetaChannelAdapter {
  if (channel !== 'FACEBOOK' && channel !== 'INSTAGRAM' && channel !== 'WHATSAPP') {
    throw new Error(`createMetaAdapter: "${channel}" is not a Meta channel`)
  }
  return new MetaChannelAdapter(channel, accessToken)
}
