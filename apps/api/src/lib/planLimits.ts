// Re-export from plans.ts as the canonical source of truth
export { PLAN_LIMITS, type Plan, type PlanLimits } from './plans.js'
import { PLAN_LIMITS } from './plans.js'

export async function checkLimit(
  prisma: any,
  workspaceId: string,
  resource: 'socialAccounts' | 'scheduledPosts' | 'teamMembers' | 'workspaces',
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return { allowed: false, limit: 0, current: 0 }

  const limits = PLAN_LIMITS[workspace.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE
  const limit = limits[resource] as number

  let current = 0
  if (resource === 'socialAccounts') {
    current = await prisma.socialAccount.count({ where: { workspaceId } })
  } else if (resource === 'scheduledPosts') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    current = await prisma.scheduledPost.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } })
  } else if (resource === 'teamMembers') {
    current = await prisma.workspaceMember.count({ where: { workspaceId } })
  }

  return { allowed: current < limit, limit: limit === Infinity ? -1 : limit, current }
}
