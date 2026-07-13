export interface InboundAttributionEvent {
  source: 'phone' | 'utm_link'
  eventType: 'call' | 'booking'
  trackedNumber?: string
  utmTag?: string
  metadata?: Record<string, unknown>
}

export interface AttributionEventProvider {
  /** Parse and validate an inbound attribution event from an external system */
  parse(rawPayload: unknown): InboundAttributionEvent | null
}

/** Adapter for events arriving via TradeFlow bridge (booking events) */
export class TradeFlowAttributionAdapter implements AttributionEventProvider {
  parse(rawPayload: unknown): InboundAttributionEvent | null {
    const p = rawPayload as Record<string, unknown>
    if (!p || typeof p !== 'object') return null
    if (p.eventType !== 'job.completed') return null
    return {
      source: 'utm_link',
      eventType: 'booking',
      utmTag: typeof p.utmTag === 'string' ? p.utmTag : undefined,
      metadata: p as Record<string, unknown>,
    }
  }
}

/** Mock adapter for testing */
export class MockAttributionAdapter implements AttributionEventProvider {
  constructor(private readonly event: InboundAttributionEvent) {}
  parse(): InboundAttributionEvent { return this.event }
}
