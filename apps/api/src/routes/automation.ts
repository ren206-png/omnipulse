/**
 * Automation Engine — REST Routes
 *
 * All routes require:
 *   • requireAuth         — JWT authentication
 *   • assertWorkspaceAccess — tenant isolation (workspace membership check)
 *
 * Routes:
 *   GET    /automations?workspaceId=       List flows
 *   POST   /automations                    Create flow
 *   GET    /automations/:flowId            Get flow + latest version
 *   PATCH  /automations/:flowId            Update flow (name / description / status)
 *   DELETE /automations/:flowId            Archive flow
 *
 *   POST   /automations/:flowId/versions                        Create draft version
 *   POST   /automations/:flowId/versions/:versionId/publish     Validate + publish version
 *
 *   POST   /automations/:flowId/versions/:versionId/nodes       Add node
 *   DELETE /automations/:flowId/versions/:versionId/nodes/:nodeId  Remove node
 *
 *   POST   /automations/:flowId/versions/:versionId/edges       Add edge
 *   DELETE /automations/:flowId/versions/:versionId/edges/:edgeId  Remove edge
 */

import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { assertWorkspaceAccess, TenantAccessError } from '../lib/tenantGuard.js'
import { sendError } from '../lib/apiError.js'
import { prisma } from '../lib/prisma.js'
import { NodeConfigSchema, TriggerConfigSchema, EdgeLabelSchema } from '../automation/types/index.js'
import { validateGraph } from '../automation/services/flowValidator.service.js'

const router = Router()

// ── Router-level feature flag guard (runs before requireAuth) ─────────────────
router.use((_req, res, next) => {
  if (process.env.AUTOMATION_ENGINE_ENABLED !== 'true') {
    sendError(res, 503, 'AUTOMATION_DISABLED', 'Automation engine is not enabled')
    return
  }
  next()
})

// ── Shared helpers ─────────────────────────────────────────────────────────────

function getWorkspaceId(req: Request): string | undefined {
  return (req.query['workspaceId'] as string | undefined) ||
         (req.body as Record<string, unknown>)?.['workspaceId'] as string | undefined
}

async function guardWorkspace(req: Request, res: Response): Promise<string | null> {
  const workspaceId = getWorkspaceId(req)
  if (!workspaceId) {
    sendError(res, 400, 'MISSING_WORKSPACE_ID', 'workspaceId is required')
    return null
  }
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) {
      sendError(res, 403, 'FORBIDDEN', e.message)
      return null
    }
    throw e
  }
  return workspaceId
}

// ── Feature flag guard ─────────────────────────────────────────────────────────

function checkAutomationEnabled(res: Response): boolean {
  if (process.env.AUTOMATION_ENGINE_ENABLED !== 'true') {
    sendError(res, 503, 'AUTOMATION_DISABLED', 'Automation engine is not enabled')
    return false
  }
  return true
}

// ── Flow CRUD ──────────────────────────────────────────────────────────────────

// GET /automations?workspaceId=
router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const flows = await prisma.automationFlow.findMany({
    where:   { workspaceId, status: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, description: true, status: true,
      priority: true, reentryPolicy: true, createdAt: true, updatedAt: true,
      versions: {
        where:   { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        take:    1,
        select:  { id: true, version: true, status: true, triggerType: true },
      },
    },
  })
  res.json({ flows })
})

const CreateFlowSchema = z.object({
  workspaceId:   z.string().min(1),
  name:          z.string().min(1).max(128),
  description:   z.string().max(512).optional(),
  priority:      z.number().int().min(0).max(100).optional(),
  reentryPolicy: z.enum(['IGNORE', 'RESTART', 'ALLOW_PARALLEL']).optional(),
})

// POST /automations
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const parsed = CreateFlowSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
    return
  }
  const { workspaceId, name, description, priority, reentryPolicy } = parsed.data

  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) { sendError(res, 403, 'FORBIDDEN', e.message); return }
    throw e
  }

  // Check workspace automation flag
  const workspace = await prisma.workspace.findUnique({
    where:  { id: workspaceId },
    select: { automationEnabled: true },
  })
  if (!workspace?.automationEnabled) {
    sendError(res, 403, 'AUTOMATION_NOT_ENABLED', 'Automation is not enabled for this workspace')
    return
  }

  const flow = await prisma.automationFlow.create({
    data: {
      workspaceId,
      name,
      description,
      priority:      priority ?? 0,
      reentryPolicy: reentryPolicy ?? 'IGNORE',
      createdBy:     req.user!.id,
    },
  })
  res.status(201).json({ flow })
})

// GET /automations/:flowId
router.get('/:flowId', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const flow = await prisma.automationFlow.findFirst({
    where:   { id: req.params['flowId'], workspaceId },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        include: {
          nodes: { include: { outgoingEdges: true } },
        },
      },
    },
  })
  if (!flow) { sendError(res, 404, 'NOT_FOUND', 'Flow not found'); return }
  res.json({ flow })
})

const UpdateFlowSchema = z.object({
  workspaceId:   z.string().min(1),
  name:          z.string().min(1).max(128).optional(),
  description:   z.string().max(512).optional(),
  priority:      z.number().int().min(0).max(100).optional(),
  reentryPolicy: z.enum(['IGNORE', 'RESTART', 'ALLOW_PARALLEL']).optional(),
})

// PATCH /automations/:flowId
router.patch('/:flowId', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const parsed = UpdateFlowSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
    return
  }
  const { workspaceId, ...data } = parsed.data
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) { sendError(res, 403, 'FORBIDDEN', e.message); return }
    throw e
  }

  const flow = await prisma.automationFlow.updateMany({
    where: { id: req.params['flowId'], workspaceId },
    data,
  })
  if (flow.count === 0) { sendError(res, 404, 'NOT_FOUND', 'Flow not found'); return }
  res.json({ ok: true })
})

// DELETE /automations/:flowId
router.delete('/:flowId', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const result = await prisma.automationFlow.updateMany({
    where: { id: req.params['flowId'], workspaceId },
    data:  { status: 'ARCHIVED' },
  })
  if (result.count === 0) { sendError(res, 404, 'NOT_FOUND', 'Flow not found'); return }
  res.json({ ok: true })
})

// ── Version management ─────────────────────────────────────────────────────────

const CreateVersionSchema = z.object({
  workspaceId:  z.string().min(1),
  triggerType:  z.enum(['KEYWORD', 'FIRST_CONTACT', 'ANY_MESSAGE', 'WEBHOOK_EVENT']),
  triggerConfig: TriggerConfigSchema,
  entryNodeKey: z.string().min(1).max(64),
})

// POST /automations/:flowId/versions
router.post('/:flowId/versions', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const parsed = CreateVersionSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
    return
  }
  const { workspaceId, triggerType, triggerConfig, entryNodeKey } = parsed.data
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) { sendError(res, 403, 'FORBIDDEN', e.message); return }
    throw e
  }

  // Verify flow belongs to workspace
  const flow = await prisma.automationFlow.findFirst({
    where: { id: req.params['flowId'], workspaceId },
    select: { id: true, versions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!flow) { sendError(res, 404, 'NOT_FOUND', 'Flow not found'); return }

  const nextVersion = (flow.versions[0]?.version ?? 0) + 1
  const version = await prisma.automationFlowVersion.create({
    data: {
      flowId: flow.id,
      version: nextVersion,
      status: 'DRAFT',
      triggerType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      triggerConfig: triggerConfig as any,
      entryNodeKey,
      graphHash: '', // computed on publish
    },
  })
  res.status(201).json({ version })
})

// POST /automations/:flowId/versions/:versionId/publish
router.post('/:flowId/versions/:versionId/publish', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const version = await prisma.automationFlowVersion.findFirst({
    where: {
      id:     req.params['versionId'],
      flowId: req.params['flowId'],
      flow:   { workspaceId },
    },
    include: {
      nodes: { include: { outgoingEdges: true } },
    },
  })
  if (!version) { sendError(res, 404, 'NOT_FOUND', 'Version not found'); return }
  if (version.status !== 'DRAFT') {
    sendError(res, 409, 'NOT_DRAFT', 'Only DRAFT versions can be published')
    return
  }

  // Build graph structures for validation
  const nodes = version.nodes.map((n) => ({
    id:       n.id,
    nodeKey:  n.nodeKey,
    nodeType: n.nodeType,
    config:   n.config,
  }))
  const edges = version.nodes.flatMap((n) =>
    n.outgoingEdges.map((e) => ({
      id:           e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      label:        e.label,
    })),
  )

  const validationResult = validateGraph(nodes, edges, version.entryNodeKey)
  if (!validationResult.valid) {
    res.status(422).json({
      error:    'GRAPH_INVALID',
      errors:   validationResult.errors,
      warnings: validationResult.warnings,
    })
    return
  }

  // Supersede any previously published version
  await prisma.automationFlowVersion.updateMany({
    where: { flowId: req.params['flowId'], status: 'PUBLISHED' },
    data:  { status: 'SUPERSEDED' },
  })

  const published = await prisma.automationFlowVersion.update({
    where: { id: req.params['versionId'] },
    data:  { status: 'PUBLISHED' },
  })

  // Activate the flow if it was still DRAFT
  await prisma.automationFlow.updateMany({
    where: { id: req.params['flowId'], status: 'DRAFT' },
    data:  { status: 'PUBLISHED' },
  })

  res.json({ version: published, warnings: validationResult.warnings })
})

// ── Node management ────────────────────────────────────────────────────────────

const AddNodeSchema = z.object({
  workspaceId: z.string().min(1),
  nodeKey:     z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, 'Invalid nodeKey'),
  config:      NodeConfigSchema,
  uiMeta:      z.record(z.string(), z.unknown()).optional(),
})

// POST /automations/:flowId/versions/:versionId/nodes
router.post('/:flowId/versions/:versionId/nodes', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const parsed = AddNodeSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
    return
  }
  const { workspaceId, nodeKey, config, uiMeta } = parsed.data
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) { sendError(res, 403, 'FORBIDDEN', e.message); return }
    throw e
  }

  const version = await prisma.automationFlowVersion.findFirst({
    where: { id: req.params['versionId'], flowId: req.params['flowId'], flow: { workspaceId } },
    select: { id: true, status: true },
  })
  if (!version) { sendError(res, 404, 'NOT_FOUND', 'Version not found'); return }
  if (version.status !== 'DRAFT') {
    sendError(res, 409, 'NOT_DRAFT', 'Cannot modify a non-DRAFT version')
    return
  }

  const node = await prisma.flowNode.create({
    data: {
      flowVersionId: version.id,
      nodeKey,
      nodeType:      config.nodeType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config:        config as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      uiMeta:        uiMeta as any,
    },
  })
  res.status(201).json({ node })
})

// DELETE /automations/:flowId/versions/:versionId/nodes/:nodeId
router.delete('/:flowId/versions/:versionId/nodes/:nodeId', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const node = await prisma.flowNode.findFirst({
    where: {
      id:           req.params['nodeId'],
      flowVersionId: req.params['versionId'],
      flowVersion: {
        flowId: req.params['flowId'],
        status: 'DRAFT',
        flow:   { workspaceId },
      },
    },
  })
  if (!node) { sendError(res, 404, 'NOT_FOUND', 'Node not found or version is not a DRAFT'); return }

  await prisma.flowNode.delete({ where: { id: node.id } })
  res.json({ ok: true })
})

// ── Edge management ────────────────────────────────────────────────────────────

const AddEdgeSchema = z.object({
  workspaceId:  z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label:        EdgeLabelSchema,
  priority:     z.number().int().min(0).max(100).optional(),
})

// POST /automations/:flowId/versions/:versionId/edges
router.post('/:flowId/versions/:versionId/edges', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const parsed = AddEdgeSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join('; '))
    return
  }
  const { workspaceId, sourceNodeId, targetNodeId, label, priority } = parsed.data
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
  } catch (e) {
    if (e instanceof TenantAccessError) { sendError(res, 403, 'FORBIDDEN', e.message); return }
    throw e
  }

  const version = await prisma.automationFlowVersion.findFirst({
    where: { id: req.params['versionId'], flowId: req.params['flowId'], flow: { workspaceId }, status: 'DRAFT' },
    select: { id: true },
  })
  if (!version) { sendError(res, 404, 'NOT_FOUND', 'Version not found or not in DRAFT state'); return }

  try {
    const edge = await prisma.flowEdge.create({
      data: { flowVersionId: version.id, sourceNodeId, targetNodeId, label, priority },
    })
    res.status(201).json({ edge })
  } catch {
    sendError(res, 409, 'DUPLICATE_EDGE', `An edge with label "${label}" already exists from this source node`)
  }
})

// DELETE /automations/:flowId/versions/:versionId/edges/:edgeId
router.delete('/:flowId/versions/:versionId/edges/:edgeId', requireAuth, async (req: Request, res: Response) => {
  if (!checkAutomationEnabled(res)) return
  const workspaceId = await guardWorkspace(req, res)
  if (!workspaceId) return

  const edge = await prisma.flowEdge.findFirst({
    where: {
      id:            req.params['edgeId'],
      flowVersionId: req.params['versionId'],
      flowVersion: {
        flowId: req.params['flowId'],
        status: 'DRAFT',
        flow:   { workspaceId },
      },
    },
  })
  if (!edge) { sendError(res, 404, 'NOT_FOUND', 'Edge not found or version is not a DRAFT'); return }

  await prisma.flowEdge.delete({ where: { id: edge.id } })
  res.json({ ok: true })
})

export default router
