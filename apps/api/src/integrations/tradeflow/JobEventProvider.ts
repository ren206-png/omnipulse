export interface JobEvent {
  eventType: 'job.booked' | 'job.completed'
  jobId: string
  tradeFlowAccountId: string
  jobType?: string
  city?: string
  rawPayload: Record<string, unknown>
}

export interface JobEventProvider {
  /**
   * Verify and parse an inbound webhook payload.
   * Returns the parsed event or throws if signature/timestamp is invalid.
   */
  verifyAndParse(payload: Buffer, signature: string, timestamp: string): Promise<JobEvent>
}
