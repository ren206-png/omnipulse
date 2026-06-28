import { prisma } from '../lib/prisma.js'
import { publishPostQueue } from '../lib/queue.js'
import { logger } from '../lib/logger.js'

export function startEvergreenWorker() {
  async function tick() {
    try {
      // Find published evergreen posts whose interval has elapsed
      const posts = await (prisma.scheduledPost.findMany as Function)({
        where: { status: 'PUBLISHED', evergreen: true, evergreenInterval: { not: null } },
      })

      for (const post of posts as Array<{
        id: string; content: string; platforms: string[]; mediaUrls: string[];
        workspaceId: string; submittedBy: string | null;
        evergreenInterval: number; scheduledFor: Date;
      }>) {
        const nextDate = new Date(post.scheduledFor)
        nextDate.setDate(nextDate.getDate() + post.evergreenInterval)

        if (nextDate <= new Date()) {
          // Create a recycled copy
          const newPost = await (prisma.scheduledPost.create as Function)({
            data: {
              workspaceId: post.workspaceId,
              content: post.content,
              platforms: post.platforms,
              mediaUrls: post.mediaUrls,
              scheduledFor: new Date(Date.now() + post.evergreenInterval * 24 * 60 * 60 * 1000),
              status: 'SCHEDULED',
              submittedBy: post.submittedBy,
              evergreenParentId: post.id,
            },
          })
          await publishPostQueue.add('publish-post', { postId: (newPost as { id: string }).id }, {
            delay: post.evergreenInterval * 24 * 60 * 60 * 1000,
          })
          logger.info({ originalPostId: post.id, newPostId: (newPost as { id: string }).id }, 'Evergreen post recycled')
        }
      }
    } catch (err) {
      logger.error({ err }, 'Evergreen worker error')
    }
  }

  // Run immediately then every hour
  tick()
  setInterval(tick, 60 * 60 * 1000)
  logger.info('Evergreen worker started')
}
