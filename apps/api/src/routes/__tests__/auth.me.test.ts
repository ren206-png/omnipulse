/**
 * Regression tests for GET /api/v1/auth/me
 *
 * These tests use Node's built-in fetch (Node 18+) and spin up the Express
 * router in isolation — no real DB needed because we mock prisma.
 *
 * Run with: npx tsx --test src/routes/__tests__/auth.me.test.ts
 * (No jest/vitest dependency required — uses the native Node test runner.)
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createServer } from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'

// ── Minimal env shim so env.ts doesn't blow up ────────────────────────────────
const JWT_SECRET = 'test-secret-for-auth-me-tests'
process.env.JWT_SECRET = JWT_SECRET
process.env.JWT_EXPIRES_IN = '1h'
process.env.NODE_ENV = 'test'
process.env.PORT = '4099'
process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x'

// ── Mock prisma before importing anything that uses it ────────────────────────
import { createRequire } from 'node:module'
const _require = createRequire(import.meta.url)

// We patch the prisma singleton via a simple module-level mock object.
// Because auth.ts imports '../lib/prisma.js' we intercept it by replacing the
// module in the registry when tests import auth.ts below.
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'OWNER',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
}

// Stub out prisma by monkey-patching the real module after import
import * as prismaModule from '../../lib/prisma.js'
;(prismaModule.prisma as unknown as { user: unknown }).user = {
  findUnique: async ({ where }: { where: { id?: string } }) => {
    if (where.id === mockUser.id) return mockUser
    return null
  },
}

// Now import the router (after prisma is stubbed)
import authRouter from '../auth.js'

// ── Build a minimal Express app ───────────────────────────────────────────────
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/v1/auth', authRouter)
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

// ── Helper: sign a valid token ────────────────────────────────────────────────
function signToken(payload: object, secret = JWT_SECRET, opts?: jwt.SignOptions) {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...opts })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /api/v1/auth/me — authenticated request returns 200 with user payload', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken({ id: mockUser.id, email: mockUser.email, role: mockUser.role })
    const res = await fetch(`${url}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`)

    const body = (await res.json()) as { user: typeof mockUser }
    assert.ok(body.user, 'Response should have a user field')
    assert.equal(body.user.id, mockUser.id)
    assert.equal(body.user.email, mockUser.email)
    assert.equal(body.user.role, mockUser.role)
    assert.ok(body.user.createdAt, 'Response should include createdAt')
  } finally {
    close()
  }
})

test('GET /api/v1/auth/me — unauthenticated request returns 401', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const res = await fetch(`${url}/api/v1/auth/me`)
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)

    const body = (await res.json()) as { error: string }
    assert.ok(body.error, 'Response should have an error field')
  } finally {
    close()
  }
})

test('GET /api/v1/auth/me — expired token returns 401', async () => {
  const app = buildApp()
  const { url, close } = await listen(app)
  try {
    const token = signToken(
      { id: mockUser.id, email: mockUser.email, role: mockUser.role },
      JWT_SECRET,
      { expiresIn: -1 }, // already expired
    )
    const res = await fetch(`${url}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  } finally {
    close()
  }
})
