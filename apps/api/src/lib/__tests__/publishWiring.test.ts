/**
 * Regression guards for the bugs that stopped every scheduled post from publishing (Oct 2026):
 *  1. publishPost.worker was never imported, so the 'publish-post' queue had no consumer.
 *  2. Workers sent the AES-encrypted OAuth token to Facebook/X/etc. instead of the decrypted one.
 *  3. Facebook stored a user token; only a Page token can post to /me/feed.
 * These read the source (the worker modules open Redis connections on import).
 * Run with: npx tsx --test src/lib/__tests__/publishWiring.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf-8')

test('index.ts imports and starts the publish-post worker', () => {
  const src = read('index.ts')
  assert.match(src, /import \{ publishPostWorker \} from '\.\/workers\/publishPost\.worker\.js'/)
  assert.match(src, /void publishPostWorker/)
})

test('publish worker never hands the encrypted token to a platform API', () => {
  const src = read('workers/publishPost.worker.ts')
  assert.doesNotMatch(src, /accessToken: account\.accessToken,\s*externalProfileId/)
  assert.doesNotMatch(src, /Bearer \$\{account\.accessToken\}/)
  assert.match(src, /accessToken: decryptToken\(account\.accessToken\)/)
})

test('a queued job for a deleted post is skipped, not retried', () => {
  const src = read('workers/publishPost.worker.ts')
  assert.doesNotMatch(src, /throw new Error\(`ScheduledPost \$\{postId\} not found`\)/)
  assert.match(src, /Post no longer exists/)
})

test('analytics sync and token refresh decrypt before calling platforms', () => {
  const sync = read('workers/analyticsSync.worker.ts')
  assert.match(sync, /decryptToken\(account\.accessToken\)/)
  assert.doesNotMatch(sync, /\$\{account\.accessToken\}/)
  const refresh = read('workers/authTokenRefresh.worker.ts')
  assert.match(refresh, /refreshFacebookToken\(decryptToken\(account\.accessToken\)\)/)
  assert.match(refresh, /accessToken: encryptToken\(result\.token\)/)
})

test('Facebook connect stores the Page token and asks for pages_show_list', () => {
  const src = read('routes/socialAccounts.ts')
  assert.match(src, /pages_show_list/)
  // lists the user's Pages with their access tokens and stores a Page token, not the user token
  assert.match(src, /me\/accounts\?fields=\$\{encodeURIComponent\('id,name,access_token/)
  assert.match(src, /accessToken = page\.access_token/)
})

test('new signups do not get a session until the email is confirmed', () => {
  const src = read('routes/auth.ts')
  assert.match(src, /requiresVerification: true/)
  assert.match(src, /EMAIL_NOT_VERIFIED/)
})
