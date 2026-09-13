import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { notify } from '../lib/notify.js'

const router = Router()

router.use(requireAuth)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id

    // Use raw SQL to avoid Prisma model validation issues with computed/default fields
    type WorkspaceRow = {
      id: string; name: string; ownerId: string; plan: string;
      onboardingComplete: boolean; brandName: string | null; brandLogoUrl: string | null;
      brandColor: string | null; automationEnabled: boolean;
      postCount: bigint; socialAccountCount: bigint; memberRole: string;
    }

    const rows = await prisma.$queryRaw<WorkspaceRow[]>`
      SELECT
        w.id, w.name, w."ownerId", w.plan, w."onboardingComplete",
        w."brandName", w."brandLogoUrl", w."brandColor", w."automationEnabled",
        COUNT(DISTINCT p.id) AS "postCount",
        COUNT(DISTINCT sa.id) AS "socialAccountCount",
        'OWNER' AS "memberRole"
      FROM "Workspace" w
      LEFT JOIN "ScheduledPost" p ON p."workspaceId" = w.id
      LEFT JOIN "SocialAccount" sa ON sa."workspaceId" = w.id
      WHERE w."ownerId" = ${userId}
      GROUP BY w.id
      UNION ALL
      SELECT
        w.id, w.name, w."ownerId", w.plan, w."onboardingComplete",
        w."brandName", w."brandLogoUrl", w."brandColor", w."automationEnabled",
        COUNT(DISTINCT p.id) AS "postCount",
        COUNT(DISTINCT sa.id) AS "socialAccountCount",
        wm.role AS "memberRole"
      FROM "WorkspaceMember" wm
      JOIN "Workspace" w ON w.id = wm."workspaceId"
      LEFT JOIN "ScheduledPost" p ON p."workspaceId" = w.id
      LEFT JOIN "SocialAccount" sa ON sa."workspaceId" = w.id
      WHERE wm."userId" = ${userId} AND w."ownerId" != ${userId}
      GROUP BY w.id, wm.role
    `

    let merged = rows.map((r) => ({
      id: r.id,
      name: r.name,
      ownerId: r.ownerId,
      plan: r.plan,
      onboardingComplete: r.onboardingComplete,
      brandName: r.brandName,
      brandLogoUrl: r.brandLogoUrl,
      brandColor: r.brandColor,
      automationEnabled: r.automationEnabled,
      memberRole: r.memberRole,
      _count: {
        posts: Number(r.postCount),
        socialAccounts: Number(r.socialAccountCount),
      },
    }))

    // Auto-provision a default workspace for users who have none
    if (merged.length === 0) {
      await prisma.$executeRaw`INSERT INTO "Workspace" (id, name, "ownerId") VALUES (gen_random_uuid()::text, 'My Workspace', ${userId})`
      const created = await prisma.$queryRaw<WorkspaceRow[]>`
        SELECT w.id, w.name, w."ownerId", w.plan, w."onboardingComplete",
          w."brandName", w."brandLogoUrl", w."brandColor", w."automationEnabled",
          0::bigint AS "postCount", 0::bigint AS "socialAccountCount",
          'OWNER' AS "memberRole"
        FROM "Workspace" w WHERE w."ownerId" = ${userId} ORDER BY w.id DESC LIMIT 1
      `
      merged = created.map((r) => ({
        id: r.id, name: r.name, ownerId: r.ownerId, plan: r.plan,
        onboardingComplete: r.onboardingComplete, brandName: r.brandName,
        brandLogoUrl: r.brandLogoUrl, brandColor: r.brandColor,
        automationEnabled: r.automationEnabled, memberRole: 'OWNER',
        _count: { posts: 0, socialAccounts: 0 },
      }))
      logger.info({ userId }, 'Auto-provisioned default workspace')
    }

    res.json({ workspaces: merged })
  } catch (err) {
    logger.error({ err }, 'List workspaces error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list workspaces')
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    sendError(res, 400, 'INVALID_NAME', 'Workspace name is required')
    return
  }

  try {
    await prisma.$executeRaw`INSERT INTO "Workspace" (id, name, "ownerId") VALUES (gen_random_uuid()::text, ${name.trim()}, ${req.user!.id})`
    const [workspace] = await prisma.$queryRaw<Array<{ id: string; name: string; ownerId: string }>>`
      SELECT id, name, "ownerId" FROM "Workspace" WHERE "ownerId" = ${req.user!.id} ORDER BY id DESC LIMIT 1
    `
    logger.info({ workspaceId: workspace.id }, 'Workspace created')
    await notify({
      userId: req.user!.id,
      type: 'POST_PUBLISHED', // reuse closest type
      title: 'Workspace created 🎉',
      body: `Your workspace "${name.trim()}" is ready. Connect your social accounts to start scheduling.`,
      link: '/dashboard/accounts',
    })
    res.status(201).json({ workspace })
  } catch (err) {
    logger.error({ err }, 'Create workspace error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create workspace')
  }
})

export default router
