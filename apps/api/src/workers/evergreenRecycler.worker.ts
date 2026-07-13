/**
 * Evergreen Recycler Worker — runs every hour.
 * Checks the EvergreenQueue for due entries and creates recycled posts.
 * FF_EVERGREEN_QUEUE must be enabled for any work to proceed.
 */
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { FF_EVERGREEN_QUEUE } from '../lib/featureFlags.js'
import { env } from '../config/env.js'
import { isInSeasonalExclusion } from '../lib/seasonalExclusion.js'

const INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const BATCH_CAP = 50

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Ask Claude Haiku to rephrase the post content.
 * Returns original content on any failure — never blocks recycling on AI failure.
 */
async function aiVaryContent(content: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return content
  if (content.length <= 50) return content

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Rephrase this social media post in the same tone and style, keeping the same message but varying the wording. Keep hashtags. Original: ${content}. Respond with ONLY the rephrased post text.`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      logger.warn({ status: response.status }, '[EvergreenRecycler] AI variation request failed — using original')
      return content
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text: string }> }
    const result = data?.content?.[0]?.text ?? ''

    if (typeof result === 'string' && result.length > 20 && result.length < 3000) {
      return result.trim()
    }

    logger.warn({ resultLength: result.length }, '[EvergreenRecycler] AI variation invalid length — using original')
    return content
  } catch (err) {
    logger.warn({ err }, '[EvergreenRecycler] AI variation error — using original')
    return content
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Find an empty calendar slot for the given workspaceId.
 * Tries tomorrow + random offset 0-6 days, cycling up to 14 days out to find a free slot.
 */
async function findEmptySlot(workspaceId: string): Promise<Date> {
  const baseOffset = Math.floor(Math.random() * 7) + 1 // 1-7 days from now
  const now = new Date()

  for (let i = 0; i < 14; i++) {
    const candidate = addDays(now, baseOffset + i)
    // Normalize to start of day UTC
    candidate.setUTCHours(9, 0, 0, 0)

    // Check if there's already a post scheduled on this day for this workspace
    const startOfDay = new Date(candidate)
    startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(candidate)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const existing = await prisma.scheduledPost.findFirst({
      where: {
        workspaceId,
        scheduledFor: { gte: startOfDay, lte: endOfDay },
        status: { in: ['DRAFT', 'SCHEDULED', 'QUEUED', 'PENDING_REVIEW', 'APPROVED'] },
      },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  // If all slots taken, fall back to 14 days out at a unique minute offset
  const fallback = addDays(now, 14)
  fallback.setUTCHours(9, Math.floor(Math.random() * 60), 0, 0)
  return fallback
}

async function run(): Promise<void> {
  if (!FF_EVERGREEN_QUEUE) return

  logger.info('[EvergreenRecycler] Starting hourly run…')

  let due: any[]
  try {
    due = await (prisma as any).evergreenQueue.findMany({
      where: {
        active: true,
        OR: [
          { nextRecycleAfter: null },
          { nextRecycleAfter: { lte: new Date() } },
        ],
      },
      include: { post: true },
      take: BATCH_CAP,
    })
  } catch (err) {
    logger.error({ err }, '[EvergreenRecycler] Failed to query EvergreenQueue')
    return
  }

  logger.info({ count: due.length }, '[EvergreenRecycler] Due entries found')

  for (const entry of due) {
    try {
      // Optimistic distributed lock: claim the entry by bumping nextRecycleAfter
      // by 1 hour atomically. If another process already claimed it, count === 0.
      const claimed = await (prisma as any).evergreenQueue.updateMany({
        where: {
          id: entry.id,
          OR: [{ nextRecycleAfter: null }, { nextRecycleAfter: { lte: new Date() } }],
        },
        data: { nextRecycleAfter: new Date(Date.now() + 60 * 60 * 1000) },
      })
      if (claimed.count === 0) {
        logger.info({ entryId: entry.id }, '[EvergreenRecycler] Entry claimed by another process — skipping')
        continue
      }

      // Step a: Skip if post is in DLQ (unresolved)
      const dlqEntry = await (prisma as any).postDlq.findFirst({
        where: { postId: entry.postId, resolvedAt: null },
      })
      if (dlqEntry) {
        logger.warn(
          { postId: entry.postId, dlqId: dlqEntry.id },
          '[EvergreenRecycler] Skipping — post is in DLQ',
        )
        continue
      }

      // Step b: Skip if in seasonal exclusion
      const exclusions = Array.isArray(entry.seasonalExclusions) ? entry.seasonalExclusions : []
      if (isInSeasonalExclusion(new Date(), exclusions)) {
        logger.info(
          { postId: entry.postId },
          '[EvergreenRecycler] Skipping — seasonal exclusion active',
        )
        continue
      }

      // Step c: Verify workspaceId integrity — reject if entry.workspaceId !== post.workspaceId
      if (entry.post.workspaceId !== entry.workspaceId) {
        logger.error(
          { postId: entry.postId, entryWorkspaceId: entry.workspaceId, postWorkspaceId: entry.post.workspaceId },
          '[EvergreenRecycler] SECURITY: workspaceId mismatch — skipping entry',
        )
        // Deactivate the corrupted entry
        await (prisma as any).evergreenQueue.update({
          where: { id: entry.id },
          data: { active: false },
        })
        continue
      }

      // Step d+e: Determine content (with optional AI variation)
      const originalContent: string = entry.post.content
      const variedContent = await aiVaryContent(originalContent)

      // Find an empty calendar slot
      const scheduledFor = await findEmptySlot(entry.workspaceId)

      // Create the recycled post
      const newPost = await prisma.scheduledPost.create({
        data: {
          content: variedContent,
          platforms: entry.post.platforms,
          mediaUrls: entry.post.mediaUrls,
          workspaceId: entry.workspaceId,
          evergreenParentId: entry.postId,
          status: entry.autoPublish ? 'SCHEDULED' : 'DRAFT',
          scheduledFor,
        },
      })

      logger.info(
        { newPostId: newPost.id, parentPostId: entry.postId, autoPublish: entry.autoPublish, scheduledFor },
        '[EvergreenRecycler] Recycled post created',
      )

      // Step f: Update EvergreenQueue timestamps
      await (prisma as any).evergreenQueue.update({
        where: { id: entry.id },
        data: {
          lastRecycledAt: new Date(),
          nextRecycleAfter: addDays(new Date(), entry.minIntervalDays),
        },
      })
    } catch (err) {
      logger.error({ err, entryId: entry.id, postId: entry.postId }, '[EvergreenRecycler] Error processing entry')
      // Continue to next entry — do not abort the whole batch
    }
  }

  logger.info('[EvergreenRecycler] Hourly run complete')
}

let _started = false

export function startEvergreenRecyclerWorker(): void {
  if (_started) return
  _started = true

  // Run once shortly after startup, then every hour
  setTimeout(() => {
    run().catch((err) => logger.error({ err }, '[EvergreenRecycler] Uncaught error in run()'))
  }, 5_000)

  setInterval(() => {
    run().catch((err) => logger.error({ err }, '[EvergreenRecycler] Uncaught error in run()'))
  }, INTERVAL_MS)

  logger.info('[EvergreenRecycler] Worker registered — runs every hour')
}
