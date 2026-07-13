import crypto from 'crypto'
import { JobEvent, JobEventProvider } from './JobEventProvider.js'

const REPLAY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export class TradeFlowAdapter implements JobEventProvider {
  constructor(private readonly webhookSecret: string) {}

  async verifyAndParse(payload: Buffer, signature: string, timestamp: string): Promise<JobEvent> {
    // 1. Timestamp freshness (replay protection)
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts) || Date.now() - ts > REPLAY_WINDOW_MS) {
      throw new Error('WEBHOOK_REPLAY: timestamp out of window')
    }

    // 2. HMAC-SHA256 signature verification
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${payload.toString('utf8')}`)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new Error('WEBHOOK_SIGNATURE_INVALID')
    }

    // 3. Parse and validate shape
    const body = JSON.parse(payload.toString('utf8'))
    if (!body.event || !body.jobId || !body.accountId) {
      throw new Error('WEBHOOK_MALFORMED_PAYLOAD')
    }
    if (!['job.booked', 'job.completed'].includes(body.event)) {
      throw new Error(`WEBHOOK_UNKNOWN_EVENT: ${body.event}`)
    }

    return {
      eventType: body.event,
      jobId: String(body.jobId),
      tradeFlowAccountId: String(body.accountId),
      jobType: body.jobType ?? undefined,
      city: body.city ?? undefined,
      rawPayload: body,
    }
  }
}
