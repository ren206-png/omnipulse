import crypto from 'crypto'
import { prisma } from './prisma.js'
import { logger } from './logger.js'

export async function emitWebhook(workspaceId: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspaceId, active: true, events: { has: event } },
  })
  for (const endpoint of endpoints) {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), workspaceId, data: payload })
    const sig = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex')
    try {
      await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OmniPulse-Signature': `sha256=${sig}` },
        body,
        signal: AbortSignal.timeout(5000),
      })
    } catch (err) {
      logger.error({ err, endpointId: endpoint.id }, 'Webhook delivery failed')
    }
  }
}
