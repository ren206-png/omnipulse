/**
 * Email verification token helpers.
 * Run with: npx tsx --test src/lib/__tests__/emailVerification.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { newVerifyToken, isVerifyTokenUsable, VERIFY_TTL_MS } from '../emailVerification.js'

test('tokens are 64 hex chars, unique, and expire after 24h', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const a = newVerifyToken(now)
  const b = newVerifyToken(now)
  assert.match(a.token, /^[0-9a-f]{64}$/)
  assert.notEqual(a.token, b.token)
  assert.equal(a.expires.getTime() - now.getTime(), VERIFY_TTL_MS)
})

test('a token is usable until its expiry, then not', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const { expires } = newVerifyToken(now)
  assert.equal(isVerifyTokenUsable({ emailVerifyExpires: expires }, new Date(now.getTime() + 1000)), true)
  assert.equal(isVerifyTokenUsable({ emailVerifyExpires: expires }, new Date(expires.getTime() + 1)), false)
})

test('missing user or missing expiry is never usable', () => {
  assert.equal(isVerifyTokenUsable(null), false)
  assert.equal(isVerifyTokenUsable(undefined), false)
  assert.equal(isVerifyTokenUsable({ emailVerifyExpires: null }), false)
})
