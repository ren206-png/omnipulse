#!/usr/bin/env node
/**
 * One-time migration script: re-encrypt plaintext OAuth tokens with AES-256-GCM.
 *
 * Rollback: run this script with --rollback flag which decrypts all tokens
 * (only safe if TOKEN_ENCRYPTION_KEY is still set). Rollback writes the
 * decrypted plaintext back to the DB, returning it to its pre-migration state.
 *
 * Usage:
 *   Dry run (default, no DB writes):
 *     npm run reencrypt-tokens:dry
 *
 *   Execute (writes to DB):
 *     npm run reencrypt-tokens
 *
 *   Rollback (decrypt all tokens, writes to DB):
 *     npm run reencrypt-tokens -- --rollback --execute
 */

import '../src/config/env.js'
import { prisma } from '../src/lib/prisma.js'
import { encryptToken, decryptToken } from '../src/lib/tokenEncryption.js'

const DRY_RUN = !process.argv.includes('--execute')
const ROLLBACK = process.argv.includes('--rollback')
const BATCH_SIZE = 50
const BATCH_PAUSE_MS = 100

/**
 * Detect whether a token is already encrypted.
 *
 * encryptToken() produces "iv:tag:ciphertext" — three colon-separated
 * base64 segments where:
 *   - iv   = 12 bytes  → 16 base64 chars
 *   - tag  = 16 bytes  → 24 base64 chars
 *   - ciphertext = variable-length base64
 *
 * A plaintext OAuth token will almost never match this exact structure
 * (base64 chars only, exactly 3 parts, iv part exactly 16 chars, tag part
 * exactly 24 chars). We check all three constraints to be safe.
 */
function isAlreadyEncrypted(token: string): boolean {
  const parts = token.split(':')
  if (parts.length !== 3) return false

  const [ivB64, tagB64, ciphertextB64] = parts

  // IV is 12 bytes → base64 is ceil(12/3)*4 = 16 chars (no padding needed)
  if (ivB64.length !== 16) return false

  // Auth tag is 16 bytes → base64 is ceil(16/3)*4 = 24 chars (with one '=' pad)
  if (tagB64.length !== 24) return false

  // All three parts must be valid base64
  const b64Re = /^[A-Za-z0-9+/]+=*$/
  if (!b64Re.test(ivB64) || !b64Re.test(tagB64) || !b64Re.test(ciphertextB64)) return false

  // Ciphertext must be non-empty
  if (ciphertextB64.length === 0) return false

  return true
}

type AuditEntry = {
  id: string
  platform: string
  workspaceId: string
  action: 'encrypted' | 'decrypted' | 'skipped' | 'error'
  error?: string
}

async function main() {
  console.log('='.repeat(60))
  console.log(`reencryptTokens — ${new Date().toISOString()}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --execute to write)' : 'EXECUTE'}`)
  if (ROLLBACK) console.log('ROLLBACK mode: decrypting tokens back to plaintext')
  console.log('='.repeat(60))

  if (!process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY.length !== 64) {
    console.error(
      'ERROR: TOKEN_ENCRYPTION_KEY is not set or is not a 64-char hex string. Aborting.',
    )
    process.exit(1)
  }

  const counters = { total: 0, encrypted: 0, decrypted: 0, skipped: 0, errors: 0 }

  // Count total records for progress reporting
  const totalCount = await prisma.socialAccount.count()
  console.log(`Total social accounts to process: ${totalCount}\n`)

  let cursor: string | undefined = undefined

  while (true) {
    const batch = await prisma.socialAccount.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, platform: true, workspaceId: true, accessToken: true, refreshToken: true },
    })

    if (batch.length === 0) break

    cursor = batch[batch.length - 1].id

    for (const account of batch) {
      counters.total++

      const entry: AuditEntry = {
        id: account.id,
        platform: account.platform,
        workspaceId: account.workspaceId,
        action: 'skipped',
      }

      try {
        if (ROLLBACK) {
          // ---- ROLLBACK: decrypt encrypted tokens back to plaintext ----
          const alreadyPlain = !isAlreadyEncrypted(account.accessToken)
          const refreshAlreadyPlain =
            account.refreshToken == null || !isAlreadyEncrypted(account.refreshToken)

          if (alreadyPlain && refreshAlreadyPlain) {
            entry.action = 'skipped'
            counters.skipped++
          } else {
            const newAccess = isAlreadyEncrypted(account.accessToken)
              ? decryptToken(account.accessToken)
              : account.accessToken

            const newRefresh =
              account.refreshToken != null && isAlreadyEncrypted(account.refreshToken)
                ? decryptToken(account.refreshToken)
                : account.refreshToken

            if (!DRY_RUN) {
              await prisma.socialAccount.update({
                where: { id: account.id },
                data: { accessToken: newAccess, refreshToken: newRefresh },
              })
            }
            entry.action = 'decrypted'
            counters.decrypted++
          }
        } else {
          // ---- FORWARD: encrypt plaintext tokens ----
          const accessAlreadyEncrypted = isAlreadyEncrypted(account.accessToken)
          const refreshAlreadyEncrypted =
            account.refreshToken == null || isAlreadyEncrypted(account.refreshToken)

          if (accessAlreadyEncrypted && refreshAlreadyEncrypted) {
            // Both tokens are already in encrypted format — skip entirely
            entry.action = 'skipped'
            counters.skipped++
          } else {
            const newAccess = accessAlreadyEncrypted
              ? account.accessToken
              : encryptToken(account.accessToken)

            const newRefresh =
              account.refreshToken == null
                ? null
                : refreshAlreadyEncrypted
                  ? account.refreshToken
                  : encryptToken(account.refreshToken)

            if (!DRY_RUN) {
              await prisma.socialAccount.update({
                where: { id: account.id },
                data: { accessToken: newAccess, refreshToken: newRefresh },
              })
            }
            entry.action = 'encrypted'
            counters.encrypted++
          }
        }
      } catch (err) {
        entry.action = 'error'
        entry.error = err instanceof Error ? err.message : String(err)
        counters.errors++
        // Error isolation: log and continue — never abort the whole migration
        console.error(`[ERROR] id=${account.id} platform=${account.platform}: ${entry.error}`)
      }

      // Audit log every record
      console.log(JSON.stringify(entry))
    }

    // Pause between batches to avoid overloading the DB
    if (batch.length === BATCH_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS))
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total processed : ${counters.total}`)
  if (ROLLBACK) {
    console.log(`Decrypted       : ${counters.decrypted}`)
  } else {
    console.log(`Encrypted       : ${counters.encrypted}`)
  }
  console.log(`Skipped (already in target state): ${counters.skipped}`)
  console.log(`Errors          : ${counters.errors}`)
  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes were written. Re-run with --execute to apply.')
  }
  console.log('='.repeat(60))

  if (counters.errors > 0) {
    process.exitCode = 1
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
