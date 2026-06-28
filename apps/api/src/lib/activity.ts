import { prisma } from './prisma.js'
import { logger } from './logger.js'

export async function logActivity(input: {
  workspaceId: string
  userId: string
  userEmail: string
  action: string
  targetId?: string
  targetType?: string
  details?: string
}): Promise<void> {
  try {
    await prisma.activityLog.create({ data: input })
  } catch (err) {
    logger.error({ err }, 'Failed to log activity')
  }
}
