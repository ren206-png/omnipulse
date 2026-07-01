import type { Response } from 'express'

// In-memory SSE subscriber registry: userId → Set<Response>
export const sseSubscribers = new Map<string, Set<Response>>()

/** Push a notification event to all active SSE connections for a user */
export function pushNotificationToUser(
  userId: string,
  notification: {
    id: string
    type: string
    title: string
    body: string
    link: string | null
    read: boolean
    createdAt: string
  },
): void {
  const subscribers = sseSubscribers.get(userId)
  if (!subscribers?.size) return
  const data = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`
  for (const res of subscribers) {
    try {
      res.write(data)
    } catch {
      subscribers.delete(res)
    }
  }
}
