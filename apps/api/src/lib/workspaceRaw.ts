/**
 * Raw-SQL workspace helpers — bypass Prisma ORM validation of the Workspace
 * model, which fails in production when the DB schema has columns that the
 * Prisma client doesn't recognise (e.g. aiGenerationsMonth migration not yet
 * applied).  All reads and writes here go through $queryRaw / $executeRaw so
 * they are immune to that problem.
 */

import { prisma } from './prisma'

export interface WorkspaceRow {
  id: string
  name: string
  ownerId: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionStatus: string | null
  onboardingComplete: boolean
  brandName: string | null
  brandLogoUrl: string | null
  brandColor: string | null
  customDomain: string | null
  stripeMeteredItemId: string | null
  aiGenerationsMonth: number
  aiUsagePeriodStart: Date | null
  automationEnabled: boolean
}

/**
 * Fetch a workspace by its primary key.  Returns null if not found.
 */
export async function findWorkspaceById(id: string): Promise<WorkspaceRow | null> {
  const rows = await prisma.$queryRaw<WorkspaceRow[]>`
    SELECT
      id, name, "ownerId", plan,
      "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus",
      "onboardingComplete", "brandName", "brandLogoUrl", "brandColor",
      "customDomain",
      NULL::text AS "stripeMeteredItemId",
      0::int AS "aiGenerationsMonth",
      NULL::timestamptz AS "aiUsagePeriodStart",
      false AS "automationEnabled"
    FROM "Workspace"
    WHERE id = ${id}
    LIMIT 1
  `
  return rows[0] ?? null
}

/**
 * Fetch a workspace by owner user-id.  Returns null if not found.
 */
export async function findWorkspaceByOwner(ownerId: string): Promise<WorkspaceRow | null> {
  const rows = await prisma.$queryRaw<WorkspaceRow[]>`
    SELECT
      id, name, "ownerId", plan,
      "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus",
      "onboardingComplete", "brandName", "brandLogoUrl", "brandColor",
      "customDomain",
      NULL::text AS "stripeMeteredItemId",
      0::int AS "aiGenerationsMonth",
      NULL::timestamptz AS "aiUsagePeriodStart",
      false AS "automationEnabled"
    FROM "Workspace"
    WHERE "ownerId" = ${ownerId}
    LIMIT 1
  `
  return rows[0] ?? null
}

/**
 * Update one or more columns on a workspace.  Only the supplied columns are
 * touched.  Returns the updated row.
 */
export async function updateWorkspace(
  id: string,
  data: Partial<Omit<WorkspaceRow, 'id'>>,
): Promise<WorkspaceRow | null> {
  const entries = Object.entries(data)
  if (entries.length === 0) return findWorkspaceById(id)

  // Build SET clause: "col" = $n
  const setClauses = entries.map(([col], i) => `"${col}" = $${i + 2}`).join(', ')
  const values = [id, ...entries.map(([, v]) => v)]

  // Use template literal approach via $queryRaw with raw string building
  // We need dynamic SQL here so we use prisma.$queryRawUnsafe
  const rows = await prisma.$queryRawUnsafe<WorkspaceRow[]>(
    `UPDATE "Workspace" SET ${setClauses} WHERE id = $1 RETURNING
      id, name, "ownerId", plan,
      "stripeCustomerId", "stripeSubscriptionId", "subscriptionStatus",
      "onboardingComplete", "brandName", "brandLogoUrl", "brandColor",
      "customDomain",
      NULL::text AS "stripeMeteredItemId",
      0::int AS "aiGenerationsMonth",
      NULL::timestamptz AS "aiUsagePeriodStart",
      false AS "automationEnabled"`,
    ...values,
  )
  return rows[0] ?? null
}

/**
 * Determine the role of `userId` in `workspaceId`.
 * Returns 'OWNER' | 'ADMIN' | 'MEMBER' | null (null = no access).
 */
export async function getWorkspaceRole(
  workspaceId: string,
  userId: string,
): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
  const ws = await prisma.$queryRaw<{ ownerId: string }[]>`
    SELECT "ownerId" FROM "Workspace" WHERE id = ${workspaceId} LIMIT 1
  `
  if (!ws.length) return null
  if (ws[0].ownerId === userId) return 'OWNER'

  const members = await prisma.$queryRaw<{ role: string }[]>`
    SELECT role FROM "WorkspaceMember"
    WHERE "workspaceId" = ${workspaceId} AND "userId" = ${userId}
    LIMIT 1
  `
  return (members[0]?.role as 'ADMIN' | 'MEMBER') ?? null
}
