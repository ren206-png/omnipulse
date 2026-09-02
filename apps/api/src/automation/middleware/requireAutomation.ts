/**
 * Automation Engine — Feature Flag Middleware
 *
 * Rejects requests with 503 if:
 *   1. The global AUTOMATION_ENGINE_ENABLED env var is not 'true', OR
 *   2. The workspace does not have automationEnabled = true.
 *
 * Must be mounted after requireAuth and after workspaceId is on the request
 * (either from req.params.workspaceId or the workspace resolved via the auth
 * middleware's workspace resolution — the exact lookup pattern follows the
 * existing workspace routes convention).
 */

import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../../lib/prisma.js'
import { sendError } from '../../lib/apiError.js'

export async function requireAutomationEnabled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Global feature flag
  if (process.env.AUTOMATION_ENGINE_ENABLED !== 'true') {
    sendError(res, 503, 'AUTOMATION_DISABLED', 'Automation engine is not enabled')
    return
  }

  // Per-workspace flag — workspaceId comes from query param or body
  const workspaceId =
    (req.query['workspaceId'] as string | undefined) ||
    (req.body as Record<string, unknown> | undefined)?.['workspaceId'] as string | undefined

  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { automationEnabled: true },
    })
    if (!workspace?.automationEnabled) {
      sendError(res, 403, 'AUTOMATION_NOT_ENABLED_FOR_WORKSPACE', 'Automation is not enabled for this workspace')
      return
    }
  }

  next()
}
