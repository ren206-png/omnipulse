import crypto from 'crypto'
import { prisma } from './prisma.js'
import { logger } from './logger.js'

export interface WebhookDeliveryResult {
  endpointId: string
  url: string
  status: 'delivered' | 'http_error' | 'network_error'
  statusCode?: number
}

export async function emitWebhook(
  workspaceId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<WebhookDeliveryResult[]> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspaceId, active: true, events: { has: event } },
  })

  const results: WebhookDeliveryResult[] = []

  for (const endpoint of endpoints) {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      workspaceId,
      data: payload,
    })
    const sig = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex')

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OmniPulse-Signature': `sha256=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        // Log the non-2xx response so failures are visible in monitoring
        logger.warn(
          { endpointId: endpoint.id, url: endpoint.url, statusCode: res.status, event },
          'Webhook delivery returned non-2xx response',
        )
        results.push({ endpointId: endpoint.id, url: endpoint.url, status: 'http_error', statusCode: res.status })
      } else {
        logger.debug(
          { endpointId: endpoint.id, url: endpoint.url, statusCode: res.status, event },
          'Webhook delivered',
        )
        results.push({ endpointId: endpoint.id, url: endpoint.url, status: 'delivered', statusCode: res.status })
      }
    } catch (err) {
      logger.error({ err, endpointId: endpoint.id, url: endpoint.url, event }, 'Webhook delivery failed (network error)')
      results.push({ endpointId: endpoint.id, url: endpoint.url, status: 'network_error' })
    }
  }

  return results
}
