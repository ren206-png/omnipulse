/**
 * AES-256-GCM token encryption for OAuth access/refresh tokens.
 * Key is loaded from TOKEN_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 * If the key is absent, tokens are returned as-is (plaintext fallback for dev).
 * Never log decrypted token values.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { logger } from './logger.js'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12  // 96-bit IV for GCM
const TAG_LEN = 16 // 128-bit auth tag

function getKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? ''
  if (!hex || hex.length !== 64) return null
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypt a plaintext token. Returns "iv:tag:ciphertext" base64-encoded string.
 * If encryption key is not configured, returns plaintext unchanged.
 */
export function encryptToken(plain: string): string {
  const key = getKey()
  if (!key) return plain // dev fallback — no key configured

  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypt a token produced by encryptToken.
 * If the value does not look like an encrypted token, returns it unchanged (plaintext passthrough).
 */
export function decryptToken(stored: string): string {
  if (!stored) return stored
  const key = getKey()
  if (!key) return stored // dev fallback

  const parts = stored.split(':')
  if (parts.length !== 3) return stored // not encrypted — plaintext passthrough

  try {
    const iv = Buffer.from(parts[0], 'base64')
    const tag = Buffer.from(parts[1], 'base64')
    const encrypted = Buffer.from(parts[2], 'base64')
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
  } catch (err) {
    logger.error({ err }, 'Token decryption failed — returning stored value as-is')
    return stored
  }
}
