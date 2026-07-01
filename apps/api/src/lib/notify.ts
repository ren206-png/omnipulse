import { prisma } from './prisma.js'
import { logger } from './logger.js'
import { pushNotificationToUser } from './sseRegistry.js'

export type NotificationType =
  | 'POST_PUBLISHED'
  | 'POST_FAILED'
  | 'POST_SUBMITTED_REVIEW'
  | 'POST_APPROVED'
  | 'POST_REJECTED'
  | 'MEMBER_JOINED'
  | 'INVITATION_SENT'

interface NotifyInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const created = await prisma.notification.create({ data: input })
    try {
      pushNotificationToUser(input.userId, {
        id: created.id,
        type: created.type,
        title: created.title,
        body: created.body,
        link: created.link ?? null,
        read: created.read,
        createdAt: created.createdAt.toISOString(),
      })
    } catch { /* SSE push is non-critical */ }
  } catch (err) {
    // Notifications are non-critical — log and continue
    logger.error({ err }, 'Failed to create notification')
  }
}

// notifyMany routes through notify() individually so SSE push fires for each recipient
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return
  await Promise.allSettled(inputs.map((input) => notify(input)))
}

// Get all admin/owner user IDs for a workspace
export async function getWorkspaceAdmins(workspaceId: string): Promise<string[]> {
  const [workspace, members] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'ADMIN' },
      select: { userId: true },
    }),
  ])
  const ids = members.map((m) => m.userId)
  if (workspace?.ownerId) ids.unshift(workspace.ownerId)
  return [...new Set(ids)]
}
