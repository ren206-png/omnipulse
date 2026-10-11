import crypto from 'crypto'

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** A fresh single-use verification token and its expiry. */
export function newVerifyToken(now: Date = new Date()): { token: string; expires: Date } {
  return {
    token: crypto.randomBytes(32).toString('hex'),
    expires: new Date(now.getTime() + VERIFY_TTL_MS),
  }
}

/** True when the stored token exists, matches nothing stale, and has not expired. */
export function isVerifyTokenUsable(
  user: { emailVerifyExpires: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!user && !!user.emailVerifyExpires && user.emailVerifyExpires.getTime() > now.getTime()
}
