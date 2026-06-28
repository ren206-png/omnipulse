export const PLAN_LIMITS = {
  FREE: { workspaces: 1, socialAccounts: 3, postsPerMonth: 10, teamMembers: 1 },
  PRO: { workspaces: 5, socialAccounts: 10, postsPerMonth: 200, teamMembers: 5 },
  AGENCY: { workspaces: 20, socialAccounts: 50, postsPerMonth: Infinity, teamMembers: 20 },
}

export async function checkLimit(
  prisma: any,
  workspaceId: string,
  resource: keyof typeof PLAN_LIMITS['FREE'],
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return { allowed: false, limit: 0, current: 0 }

  const limits = PLAN_LIMITS[workspace.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.FREE
  const limit = limits[resource]

  let current = 0
  if (resource === 'socialAccounts') {
    current = await prisma.socialAccount.count({ where: { workspaceId } })
  } else if (resource === 'postsPerMonth') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    current = await prisma.scheduledPost.count({ where: { workspaceId, createdAt: { gte: startOfMonth } } })
  } else if (resource === 'teamMembers') {
    current = await prisma.workspaceMember.count({ where: { workspaceId } })
  }

  return { allowed: current < limit, limit: limit === Infinity ? -1 : limit, current }
}
