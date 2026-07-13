import type { InboundAttributionEvent } from './AttributionEventProvider.js'

export async function recordAttributionEvent(params: {
  postId: string
  workspaceId: string
  event: InboundAttributionEvent
  prismaClient: any
}): Promise<void> {
  const { postId, workspaceId, event, prismaClient } = params

  await prismaClient.$transaction(async (tx: any) => {
    // 1. Upsert PostAttribution
    const existing = await tx.postAttribution.findUnique({ where: { postId } })

    const incrementField =
      event.eventType === 'call'
        ? { callsReceived: { increment: 1 } }
        : { bookingsCreated: { increment: 1 } }

    if (existing) {
      await tx.postAttribution.update({
        where: { postId },
        data: {
          ...incrementField,
          lastUpdatedAt: new Date(),
          // Update trackedNumber/utmTag if provided and not yet set
          ...(event.trackedNumber && !existing.trackedNumber
            ? { trackedNumber: event.trackedNumber }
            : {}),
          ...(event.utmTag && !existing.utmTag ? { utmTag: event.utmTag } : {}),
        },
      })
    } else {
      await tx.postAttribution.create({
        data: {
          postId,
          workspaceId,
          trackedNumber: event.trackedNumber ?? null,
          utmTag: event.utmTag ?? null,
          callsReceived: event.eventType === 'call' ? 1 : 0,
          bookingsCreated: event.eventType === 'booking' ? 1 : 0,
          lastUpdatedAt: new Date(),
        },
      })
    }

    // 4. Append to AttributionEvent table
    await tx.attributionEvent.create({
      data: {
        postId,
        workspaceId,
        eventType: event.eventType,
        source: event.source,
        metadata: event.metadata ?? null,
      },
    })
  })
}

export async function getPostAttributionSummary(params: {
  postId: string
  workspaceId: string
  prismaClient: any
}): Promise<{
  callsReceived: number
  bookingsCreated: number
  trackedNumber?: string
  utmTag?: string
} | null> {
  const { postId, workspaceId, prismaClient } = params

  const record = await prismaClient.postAttribution.findUnique({
    where: { postId },
  })

  if (!record || record.workspaceId !== workspaceId) return null

  return {
    callsReceived: record.callsReceived,
    bookingsCreated: record.bookingsCreated,
    trackedNumber: record.trackedNumber ?? undefined,
    utmTag: record.utmTag ?? undefined,
  }
}
