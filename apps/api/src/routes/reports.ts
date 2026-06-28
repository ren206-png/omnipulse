import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { sendError } from '../lib/apiError.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'

const router = Router()

// POST /api/v1/reports — create a shared report
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, label, expiresAt, startDate, endDate } = req.body as {
    workspaceId?: string
    label?: string
    expiresAt?: string
    startDate?: string
    endDate?: string
  }

  if (!workspaceId) {
    sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId is required')
    return
  }

  try {
    // Verify the user owns this workspace
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ownerId: req.user!.id },
    })
    if (!workspace) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const report = await (prisma as any).sharedReport.create({
      data: {
        workspaceId,
        label: label ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: req.user!.id,
      },
    })

    res.status(201).json({
      report: {
        id: report.id,
        token: report.token,
        label: report.label,
        startDate: report.startDate,
        endDate: report.endDate,
        expiresAt: report.expiresAt,
        shareUrl: `${env.APP_URL}/reports/${report.token}`,
      },
    })
  } catch (err) {
    logger.error({ err }, 'Create shared report error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create shared report')
  }
})

// GET /api/v1/reports?workspaceId= — list reports for workspace
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.query as { workspaceId?: string }

  if (!workspaceId) {
    sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId query param is required')
    return
  }

  try {
    // Verify ownership
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, ownerId: req.user!.id },
    })
    if (!workspace) {
      sendError(res, 403, 'FORBIDDEN', 'Workspace not found or access denied')
      return
    }

    const reports = await (prisma as any).sharedReport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      reports: (reports as Array<{ id: string; token: string; label: string | null; startDate: string | null; endDate: string | null; expiresAt: Date | null; createdAt: Date }>).map((r) => ({
        id: r.id,
        token: r.token,
        label: r.label,
        startDate: r.startDate,
        endDate: r.endDate,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        shareUrl: `${env.APP_URL}/reports/${r.token}`,
      })),
    })
  } catch (err) {
    logger.error({ err }, 'List shared reports error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list shared reports')
  }
})

// DELETE /api/v1/reports/:id — delete a report
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const report = await (prisma as any).sharedReport.findUnique({ where: { id } })
    if (!report) {
      sendError(res, 404, 'NOT_FOUND', 'Report not found')
      return
    }

    // Verify ownership through workspace
    const workspace = await prisma.workspace.findFirst({
      where: { id: report.workspaceId, ownerId: req.user!.id },
    })
    if (!workspace) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied')
      return
    }

    await (prisma as any).sharedReport.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    logger.error({ err }, 'Delete shared report error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete shared report')
  }
})

// GET /api/v1/reports/public/:token — public analytics data (no auth)
router.get('/public/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params

  try {
    const report = await (prisma as any).sharedReport.findUnique({
      where: { token },
      include: { workspace: true },
    })

    if (!report) {
      sendError(res, 404, 'NOT_FOUND', 'Report not found')
      return
    }

    // Check expiry
    if (report.expiresAt && report.expiresAt < new Date()) {
      sendError(res, 410, 'EXPIRED', 'This report link has expired')
      return
    }

    // Use stored date range if present, else default last 30 days
    const rangeEnd = report.endDate ? new Date(report.endDate) : new Date()
    const rangeStart = report.startDate
      ? new Date(report.startDate)
      : new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch social accounts with their latest snapshots
    const socialAccounts = await prisma.socialAccount.findMany({
      where: { workspaceId: report.workspaceId },
      include: {
        snapshots: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    })

    // Published post count within the report's date range
    const publishedPostCount = await prisma.scheduledPost.count({
      where: {
        workspaceId: report.workspaceId,
        status: 'PUBLISHED',
        scheduledFor: { gte: rangeStart, lte: rangeEnd },
      },
    })

    // Build snapshots summary
    const snapshots = socialAccounts.map((acct) => {
      const latest = acct.snapshots[0]
      return {
        platform: acct.platform,
        externalProfileId: acct.externalProfileId,
        followers: latest?.followers ?? 0,
        impressions: latest?.impressions ?? 0,
        engagementRate: latest?.engagementRate ?? 0,
      }
    })

    // Platform breakdown — aggregate follower totals per platform
    const platformBreakdown: Record<string, { totalFollowers: number; accounts: number }> = {}
    for (const s of snapshots) {
      if (!platformBreakdown[s.platform]) {
        platformBreakdown[s.platform] = { totalFollowers: 0, accounts: 0 }
      }
      platformBreakdown[s.platform].totalFollowers += s.followers
      platformBreakdown[s.platform].accounts += 1
    }

    res.json({
      workspaceName: report.workspace.name,
      label: report.label,
      startDate: report.startDate ?? rangeStart.toISOString().split('T')[0],
      endDate: report.endDate ?? rangeEnd.toISOString().split('T')[0],
      generatedAt: new Date().toISOString(),
      publishedPostCount,
      snapshots,
      platformBreakdown,
    })
  } catch (err) {
    logger.error({ err }, 'Public report fetch error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load report')
  }
})

export default router
