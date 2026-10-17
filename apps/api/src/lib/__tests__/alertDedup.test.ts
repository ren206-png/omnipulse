/**
 * A long-lived warning (YouTube flagged as "cannot be auto-refreshed") re-reported every 15 minutes and
 * produced ~300 Sentry events in a week. Warnings now repeat at most every 6 hours; critical always fires.
 * Run with: npx tsx --test src/lib/__tests__/alertDedup.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { dedupWindowMs } = await import('../alertManager.js')
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('critical alerts are never suppressed', () => {
  assert.equal(dedupWindowMs('critical'), 0)
})

test('warnings and info are suppressed for 6 hours', () => {
  assert.equal(dedupWindowMs('warning'), 6 * 60 * 60 * 1000)
  assert.equal(dedupWindowMs('info'), 6 * 60 * 60 * 1000)
})

test('the token-refresh scan skips Google/YouTube (refreshed on demand by the publisher)', () => {
  const src = readFileSync(join(SRC, 'workers/authTokenRefresh.worker.ts'), 'utf-8')
  assert.match(src, /platform: \{ notIn: \['GOOGLE', 'YOUTUBE'\] \}/)
})
