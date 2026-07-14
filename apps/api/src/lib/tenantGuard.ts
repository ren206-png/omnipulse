import { prisma } from './prisma.js'
import { env } from '../config/env.js'
import { createHmac, timingSafeEqual } from 'crypto'

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface WorkspaceMembership {
  workspaceId: string
  userId: string
  role: Role
}

export class TenantAccessError extends Error {
  constructor(
    public readonly statusCode: 400 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TenantAccessError'
  }
}

const ROLE_RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 }

/**
 * Verify that userId is a member of workspaceId and optionally meets a minimum role.
 */
export async function assertWorkspaceAccess(
  workspaceId: string | undefined | null,
  userId: string,
  minRole?: Role,
): Promise<WorkspaceMembership> {
  if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim() === '') {
    throw new TenantAccessError(400, 'MISSING_WORKSPACE_ID', 'workspaceId is required')
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } })
  if (!workspace) {
    throw new TenantAccessError(403, 'FORBIDDEN', 'Workspace not found or access denied')
  }

  let resolvedRole: Role
  if (workspace.ownerId === userId) {
    resolvedRole = 'OWNER'
  } else {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!membership) {
      throw new TenantAccessError(403, 'FORBIDDEN', 'Workspace not found or access denied')
    }
    resolvedRole = membership.role as Role
  }

  if (minRole !== undefined && ROLE_RANK[resolvedRole] < ROLE_RANK[minRole]) {
    throw new TenantAccessError(403, 'INSUFFICIENT_ROLE', 'Insufficient role for this action')
  }

  return { workspaceId, userId, role: resolvedRole }
}

/**
 * Synchronous cross-verification that a fetched resource belongs to the asserted workspace.
 */
export function assertResourceBelongsToWorkspace(
  resourceWorkspaceId: string,
  claimedWorkspaceId: string,
): void {
  if (resourceWorkspaceId !== claimedWorkspaceId) {
    throw new TenantAccessError(403, 'RESOURCE_WORKSPACE_MISMATCH', 'Resource does not belong to the specified workspace')
  }
}

/**
 * Create a tamper-proof OAuth state token.
 * Format: `<nonce>.<hmac-sha256-hex>`
 */
export function createOAuthState(
  workspaceId: string,
  userId: string,
  platform: string,
  pkceVerifier?: string,
): string {
  const nonce = Buffer.from(
    JSON.stringify({ workspaceId, userId, platform, pkceVerifier, iat: Date.now() }),
  ).toString('base64url')
  const sig = createHmac('sha256', env.JWT_SECRET).update(nonce).digest('hex')
  return `${nonce}.${sig}`
}

/**
 * Verify HMAC signature and return the full OAuth state payload including userId.
 * Use this ONLY in the public OAuth callback where req.user is not available.
 *
 * @throws TenantAccessError(400) if state is malformed or HMAC invalid
 */
export function extractOAuthStatePayload(
  state: string,
): { workspaceId: string; userId: string; platform: string; pkceVerifier?: string } {
  const parts = state.split('.')
  if (parts.length !== 2) {
    throw new TenantAccessError(400, 'INVALID_STATE', 'OAuth state is malformed')
  }
  const [nonce, sig] = parts as [string, string]
  const expectedSig = createHmac('sha256', env.JWT_SECRET).update(nonce).digest('hex')

  // Both buffers must be the same byte length for timingSafeEqual
  const sigBuf = Buffer.from(sig, 'hex')
  const expectedBuf = Buffer.from(expectedSig, 'hex')
  if (sigBuf.length !== expectedBuf.length) {
    throw new TenantAccessError(400, 'INVALID_STATE', 'OAuth state signature is invalid')
  }
  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    throw new TenantAccessError(400, 'INVALID_STATE', 'OAuth state signature is invalid')
  }

  let payload: { workspaceId?: string; userId?: string; platform?: string; pkceVerifier?: string }
  try {
    payload = JSON.parse(Buffer.from(nonce, 'base64url').toString()) as typeof payload
  } catch {
    throw new TenantAccessError(400, 'INVALID_STATE', 'OAuth state payload is malformed')
  }

  if (typeof payload.workspaceId !== 'string' || !payload.workspaceId) {
    throw new TenantAccessError(400, 'INVALID_STATE', 'OAuth state missing workspaceId')
  }

  return {
    workspaceId: payload.workspaceId,
    userId: payload.userId ?? '',
    platform: payload.platform ?? '',
    pkceVerifier: payload.pkceVerifier,
  }
}

/**
 * Verify and decode an OAuth state token.
 * Checks: (1) HMAC signature is valid, (2) stored userId === the passed userId.
 *
 * @throws TenantAccessError(400) if state is malformed or signature invalid
 * @throws TenantAccessError(403) if stored.userId !== passed userId
 */
export function verifyOAuthState(
  state: string,
  userId: string,
): { workspaceId: string; platform: string; pkceVerifier?: string } {
  const payload = extractOAuthStatePayload(state)
  if (payload.userId !== userId) {
    throw new TenantAccessError(403, 'STATE_USER_MISMATCH', 'OAuth state user mismatch')
  }
  return { workspaceId: payload.workspaceId, platform: payload.platform, pkceVerifier: payload.pkceVerifier }
}
