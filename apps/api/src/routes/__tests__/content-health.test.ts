/**
 * Regression tests for GET /api/v1/posts/content-health
 *
 * Critical test: authenticated user requesting a foreign workspaceId → 403.
 *
 * Run with: npx tsx --test src/routes/__tests__/content-health.test.ts
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createServer } from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'

// ── Minimal env shim ──────────────────────────────────────────────────────────
const JWT_SECRET = 'test-secret-for-content-health-tests'
process.env.JWT_SECRET = JWT_SECRET
process.env.JWT_EXPIRES_IN = '1h'
process.env.NODE_ENV = 'test'
process.env.PORT = '4099'
process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x'

// ── Mock prisma before importing anything that uses it ────────────────────────
import * as prismaModule from '../../lib/prisma.js'

const OWNER_USER_ID = 'user-owner-123'
const MEMBER_USER_ID = 'user-member-456'
const FOREIGN_USER_ID = 'user-foreign-789'
const OWN_WORKSPACE_ID = 'workspace-own-abc'
const FOREIGN_WORKSPACE_ID = 'workspace-foreign-xyz'

;(prismaModule.prisma as unknown as Record<string, unknown>).workspace = {
  findUnique: async ({ where }: { where: { id: string } }) => {
    if (where.id === OWN_WORKSPACE_ID) return { id: OWN_WORKSPACE_ID, ownerId: OWNER_USER_ID }
    if (where.id === FOREIGN_WORKSPACE_ID) return { id: FOREIGN_WORKSPACE_ID, ownerId: 'someone-else' }
    return null
  },
}
;(prismaModule.prisma as unknown as Record<string, unknown>).workspaceMember = {
  findUnique: async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) => {
    const { workspaceId, userId } = where.workspaceId_userId
    if (workspaceId === OWN_WORKSPACE_ID && userId === MEMBER_USER_ID) return { role: 'MEMBER' }
    return null
  },
}
;(prismaModule.prisma as unknown as Record<string, unknown>).scheduledPost = {
  findMany: async () => [],
}
// Auth middleware also queries user for passwordChangedAt
;(prismaModule.prisma as unknown as Record<string, unknown>).user = {
  findUnique: async () => ({ passwordChangedAt: null }),
}

// Now import the router (after prisma is stubbed)
import postsRouter from '../posts.js'

// ── Build a minimal Express app ───────────────────────────────────────────────
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/posts', postsRouter)
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

function signToken(userId: string) {
  return jwt.sign({ id: userId, email: `${userId}@test.com`, role: 'MEMBER' }, JWT_SECRET, { expiresIn: '1h' })
}

// ── Test A: unauthenticated request → 401 ─────────────────────────────────────
test('GET /content-health — unauthenticated request returns 401', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const res = await fetch(`${url}/api/v1/posts/content-health?workspaceId=${OWN_WORKSPACE_ID}`)
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  } finally {
    close()
  }
})

// ── Test B: authenticated user requests their own workspace → 200 ─────────────
test('GET /content-health — member of workspace returns 200', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(MEMBER_USER_ID)
    const res = await fetch(`${url}/api/v1/posts/content-health?workspaceId=${OWN_WORKSPACE_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`)
    const body = (await res.json()) as { posts: unknown[] }
    assert.ok(Array.isArray(body.posts), 'Response should have a posts array')
  } finally {
    close()
  }
})

// ── Test C: authenticated user requests a foreign workspace → 403 (CRITICAL) ──
test('GET /content-health — non-member requesting foreign workspace returns 403', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(FOREIGN_USER_ID)
    const res = await fetch(`${url}/api/v1/posts/content-health?workspaceId=${FOREIGN_WORKSPACE_ID}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 403, `Expected 403, got ${res.status} — cross-tenant data leak!`)
    const body = (await res.json()) as { error: string }
    assert.ok(body.error, 'Response should have an error field')
  } finally {
    close()
  }
})
