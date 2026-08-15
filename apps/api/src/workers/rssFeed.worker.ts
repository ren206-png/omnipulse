/**
 * RSS Feed Auto-Poll Worker
 *
 * Runs every 5 minutes. For each active RssFeed whose checkInterval
 * (in minutes) has elapsed since lastCheckedAt, fetches the feed,
 * parses new items, and creates DRAFT ScheduledPosts.
 *
 * Deduplication: tracks lastItemGuid — stops processing items once
 * it hits the previously-seen GUID.
 *
 * AI caption: if ANTHROPIC_API_KEY is set, generates a short caption
 * from the item title/description instead of using raw text.
 */

import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'
import { heartbeat } from '../lib/workerHeartbeat.js'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // check every 5 minutes
const MAX_NEW_ITEMS_PER_FEED = 10 // safety cap per run
const FETCH_TIMEOUT_MS = 15_000

// ── RSS parser (no external deps) ────────────────────────────────────────────

interface RssItem {
  guid: string
  title: string
  description: string
  link: string
  pubDate: string
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'),
      )
      return m ? m[1].trim() : ''
    }
    const guid = get('guid') || get('link')
    const title = get('title')
    const description = get('description').replace(/<[^>]+>/g, '').trim()
    const link = get('link')
    const pubDate = get('pubDate')
    if (guid) items.push({ guid, title, description, link, pubDate })
  }
  return items
}

// ── AI caption generation (best-effort, falls back to raw text) ───────────────

async function aiCaption(title: string, description: string, link: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return buildFallbackCaption(title, description, link)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Write a concise, engaging social media post (max 250 chars) for this article. Include the link at the end. No hashtags.

Title: ${title}
Summary: ${description.slice(0, 400)}
Link: ${link}

Respond with ONLY the post text.`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) return buildFallbackCaption(title, description, link)
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> }
    const text = data?.content?.[0]?.text?.trim() ?? ''
    return text.length > 20 ? text : buildFallbackCaption(title, description, link)
  } catch {
    return buildFallbackCaption(title, description, link)
  } finally {
    clearTimeout(timeout)
  }
}

function buildFallbackCaption(title: string, description: string, link: string): string {
  const body = title || description.slice(0, 200)
  const suffix = link ? `\n\n${link}` : ''
  return `${body}${suffix}`.trim().slice(0, 500)
}

// ── Per-feed check ────────────────────────────────────────────────────────────

async function checkFeed(feed: {
  id: string
  workspaceId: string
  url: string
  name: string
  platforms: string[]
  lastItemGuid: string | null
  checkInterval: number
}): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let xml: string
  try {
    // WEEKLY-AUDIT: SSRF risk — feed.url is user-supplied. Consider restricting to http/https
    // and blocking RFC 1918 / loopback addresses before fetching.
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'OmniPulse RSS Bot/1.0' },
    })
    if (!res.ok) {
      logger.warn({ feedId: feed.id, status: res.status }, '[RssFeed] Fetch failed')
      return
    }
    xml = await res.text()
  } catch (err) {
    logger.warn({ err, feedId: feed.id }, '[RssFeed] Fetch error')
    return
  } finally {
    clearTimeout(timeout)
  }

  const items = parseRssItems(xml)
  if (!items.length) {
    await prisma.rssFeed.update({ where: { id: feed.id }, data: { lastCheckedAt: new Date() } })
    return
  }

  let newCount = 0
  let latestGuid = feed.lastItemGuid

  for (const item of items) {
    // Stop at previously seen GUID
    if (feed.lastItemGuid && item.guid === feed.lastItemGuid) break
    if (newCount >= MAX_NEW_ITEMS_PER_FEED) break

    try {
      const content = await aiCaption(item.title, item.description, item.link)

      await prisma.scheduledPost.create({
        data: {
          workspaceId: feed.workspaceId,
          content,
          mediaUrls: [],
          platforms: feed.platforms as any,
          // Schedule 1h from now, staggered by item index so they don't stack
          scheduledFor: new Date(Date.now() + (newCount + 1) * 60 * 60 * 1000),
          status: 'DRAFT',
        },
      })

      if (newCount === 0) latestGuid = item.guid
      newCount++
    } catch (err) {
      logger.error({ err, feedId: feed.id, guid: item.guid }, '[RssFeed] Failed to create post')
    }
  }

  await prisma.rssFeed.update({
    where: { id: feed.id },
    data: {
      lastCheckedAt: new Date(),
      ...(latestGuid !== feed.lastItemGuid && latestGuid ? { lastItemGuid: latestGuid } : {}),
    },
  })

  if (newCount > 0) {
    logger.info({ feedId: feed.id, feedName: feed.name, newCount }, '[RssFeed] Created draft posts')
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const now = new Date()

  // Find all active feeds whose interval has elapsed
  const feeds = await prisma.rssFeed.findMany({
    where: { active: true },
  })

  const due = feeds.filter((f) => {
    if (!f.lastCheckedAt) return true // never checked → always due
    const elapsedMinutes = (now.getTime() - f.lastCheckedAt.getTime()) / 60_000
    return elapsedMinutes >= f.checkInterval
  })

  if (!due.length) return

  logger.info({ count: due.length }, '[RssFeed] Checking due feeds')

  // Check feeds sequentially to avoid rate-limit hammering
  for (const feed of due) {
    try {
      await checkFeed(feed as any)
    } catch (err) {
      logger.error({ err, feedId: feed.id }, '[RssFeed] Uncaught error checking feed')
    }
  }
  await heartbeat('rss-feed')
}

// ── Startup ───────────────────────────────────────────────────────────────────

let _started = false

export function startRssFeedWorker(): void {
  if (_started) return
  _started = true

  // Initial run 10s after startup
  setTimeout(() => {
    run().catch((err) => logger.error({ err }, '[RssFeed] Uncaught error in initial run'))
  }, 10_000)

  setInterval(() => {
    run().catch((err) => logger.error({ err }, '[RssFeed] Uncaught error in run'))
  }, POLL_INTERVAL_MS)

  logger.info('[RssFeed] Worker registered — polls every 5 minutes')
}
