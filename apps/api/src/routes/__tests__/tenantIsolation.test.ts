/**
 * Tenant isolation tests — prove cross-tenant access fails for critical models.
 *
 * Pattern: User A authenticated to Workspace A attempts to read Workspace B's
 * data via query param manipulation → must receive 403.
 *
 * Run with: npx tsx --test src/routes/__tests__/tenantIsolation.test.ts
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createServer } from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'

// ── Minimal env shim ──────────────────────────────────────────────────────────
const JWT_SECRET = 'test-secret-for-tenant-isolation-tests'
process.env.JWT_SECRET = JWT_SECRET
process.env.JWT_EXPIRES_IN = '1h'
process.env.NODE_ENV = 'test'
process.env.PORT = '4098'
process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x'
process.env.ADMIN_EMAIL = 'admin@test.com'

// ── Mock prisma before importing routes ───────────────────────────────────────
import * as prismaModule from '../../lib/prisma.js'

const USER_A_ID = 'user-a-111'
const USER_B_ID = 'user-b-222'
const WORKSPACE_A_ID = 'workspace-a-aaa'
const WORKSPACE_B_ID = 'workspace-b-bbb'

// Workspace A is owned by User A; Workspace B is owned by User B
;(prismaModule.prisma as unknown as Record<string, unknown>).workspace = {
  findUnique: async ({ where }: { where: { id?: string; ownerId?: string } }) => {
    if (where.id === WORKSPACE_A_ID) return { id: WORKSPACE_A_ID, ownerId: USER_A_ID }
    if (where.id === WORKSPACE_B_ID) return { id: WORKSPACE_B_ID, ownerId: USER_B_ID }
    return null
  },
  findMany: async () => [],
  count: async () => 0,
  groupBy: async () => [],
}

// User A is a member of Workspace A only
;(prismaModule.prisma as unknown as Record<string, unknown>).workspaceMember = {
  findUnique: async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) => {
    const { workspaceId, userId } = where.workspaceId_userId
    if (workspaceId === WORKSPACE_A_ID && userId === USER_A_ID) return { role: 'OWNER' }
    return null
  },
  findMany: async () => [],
}

;(prismaModule.prisma as unknown as Record<string, unknown>).scheduledPost = {
  findMany: async () => [],
  findUnique: async () => null,
  count: async () => 0,
}

;(prismaModule.prisma as unknown as Record<string, unknown>).socialAccount = {
  findMany: async () => [],
}

;(prismaModule.prisma as unknown as Record<string, unknown>).analyticsSnapshot = {
  findMany: async () => [],
}

;(prismaModule.prisma as unknown as Record<string, unknown>).postDlq = {
  findMany: async () => [],
  count: async () => 0,
}

;(prismaModule.prisma as unknown as Record<string, unknown>).user = {
  findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id === USER_A_ID || where.email === `${USER_A_ID}@test.com`) {
      return { id: USER_A_ID, email: `${USER_A_ID}@test.com`, passwordChangedAt: null }
    }
    return null
  },
  count: async () => 0,
  findMany: async () => [],
}

;(prismaModule.prisma as unknown as Record<string, unknown>).postMetric = {
  findMany: async () => [],
}

;(prismaModule.prisma as unknown as Record<string, unknown>).notification = {
  findMany: async () => [],
  count: async () => 0,
}

// Import routers after prisma is stubbed
import postsRouter from '../posts.js'
import analyticsRouter from '../analytics.js'
import dlqRouter from '../dlq.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/posts', postsRouter)
  app.use('/api/v1/analytics', analyticsRouter)
  // DLQ is an admin-only route; simulate admin by using ADMIN_EMAIL
  app.use('/api/v1/admin/dlq', dlqRouter)
  return app
}

function listen(app: express.Application): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      })
    })
  })
}

function signToken(userId: string, email?: string) {
  return jwt.sign(
    { id: userId, email: email ?? `${userId}@test.com`, role: 'MEMBER' },
    JWT_SECRET,
    { expiresIn: '1h' },
  )
}

// ── Test 1: ScheduledPost — User A cannot read Workspace B's posts ─────────────
test('GET /posts — User A requesting Workspace B returns 403', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(USER_A_ID)
    const res = await fetch(`${url}/api/v1/posts?workspaceId=${WORKSPACE_B_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(
      res.status,
      403,
      `Expected 403 (cross-tenant blocked), got ${res.status} — cross-tenant data leak on ScheduledPost!`,
    )
  } finally {
    close()
  }
})

// ── Test 2: ScheduledPost — User A can read their own workspace ───────────────
test('GET /posts — User A requesting Workspace A returns 200', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(USER_A_ID)
    const res = await fetch(`${url}/api/v1/posts?workspaceId=${WORKSPACE_A_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200, `Expected 200 for own workspace, got ${res.status}`)
  } finally {
    close()
  }
})

// ── Test 3: Analytics — User A cannot read Workspace B's analytics ─────────────
test('GET /analytics — User A requesting Workspace B returns 403', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(USER_A_ID)
    const res = await fetch(`${url}/api/v1/analytics?workspaceId=${WORKSPACE_B_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(
      res.status,
      403,
      `Expected 403 (cross-tenant blocked), got ${res.status} — cross-tenant data leak on Analytics!`,
    )
  } finally {
    close()
  }
})

// ── Test 4: PostDlq — non-admin cannot access DLQ at all ──────────────────────
test('GET /admin/dlq — non-admin user returns 403', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    // User A is not the ADMIN_EMAIL
    const token = signToken(USER_A_ID)
    const res = await fetch(`${url}/api/v1/admin/dlq?workspaceId=${WORKSPACE_B_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(
      res.status,
      403,
      `Expected 403 (admin-only route), got ${res.status} — non-admin accessed DLQ!`,
    )
  } finally {
    close()
  }
})

// ── Test 5: PostDlq — admin can access DLQ ────────────────────────────────────
test('GET /admin/dlq — admin user returns 200', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    // Sign token with ADMIN_EMAIL
    const token = signToken('admin-user-id', 'admin@test.com')
    const res = await fetch(`${url}/api/v1/admin/dlq`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200, `Expected 200 for admin DLQ access, got ${res.status}`)
  } finally {
    close()
  }
})
