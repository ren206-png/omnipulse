/**
 * Automation Engine — Channel Adapter Interface
 *
 * Every channel (Instagram, Facebook, WhatsApp, Stub) must implement this
 * interface. The outbox processor calls `send()` and expects it to either:
 *   • Resolve successfully (message delivered / accepted by the platform API).
 *   • Throw RetryableError — the outbox processor will retry with backoff.
 *   • Throw TerminalError  — the outbox processor will mark the entry FAILED.
 *
 * Adapters must be stateless (no per-message connection state).
 */

import type { AutomationChannel } from '../types/index.js'

export interface SendMessagePayload {
  contactId:     string
  channelUserId: string   // platform-specific sender ID (PSID, IGSID, WA phone number, etc.)
  text:          string
  quickReplies?: Array<{ label: string; value: string }>
  typingDelayMs?: number
}

export interface IChannelAdapter {
  /** The channel this adapter handles. */
  readonly channel: AutomationChannel

  /**
   * Deliver a message to the end-user via the platform API.
   * @throws RetryableError on transient failures (rate limit, 5xx, network).
   * @throws TerminalError  on permanent failures (invalid recipient, auth error).
   */
  send(payload: SendMessagePayload): Promise<void>
}
