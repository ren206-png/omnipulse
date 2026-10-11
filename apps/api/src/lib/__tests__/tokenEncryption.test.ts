/**
 * OAuth tokens are stored encrypted for every platform. Publishing broke because only LinkedIn was
 * decrypted before use, so these pin down the round trip and the plaintext pass-through.
 * Run with: npx tsx --test src/lib/__tests__/tokenEncryption.test.ts
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
const { encryptToken, decryptToken } = await import('../tokenEncryption.js')

test('encrypt then decrypt returns the original token', () => {
  const plain = 'EAAB-example-page-access-token'
  const stored = encryptToken(plain)
  assert.notEqual(stored, plain)
  assert.equal(stored.split(':').length, 3)
  assert.equal(decryptToken(stored), plain)
})

test('each encryption uses a fresh IV', () => {
  assert.notEqual(encryptToken('same'), encryptToken('same'))
})

test('legacy plaintext tokens pass through unchanged', () => {
  assert.equal(decryptToken('plain-legacy-token'), 'plain-legacy-token')
})

test('a tampered ciphertext decrypts to empty string, never to garbage', () => {
  const stored = encryptToken('secret')
  const [iv, tag, data] = stored.split(':')
  const flipped = Buffer.from(data, 'base64')
  flipped[0] ^= 0xff
  assert.equal(decryptToken(`${iv}:${tag}:${flipped.toString('base64')}`), '')
})
