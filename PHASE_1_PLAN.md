# OmniPulse — Phase 1 Security Fix Plan

**Author:** Claude (claude-sonnet-4-6), design only — no source files modified  
**Date:** 2026-07-13  
**Based on:** PHASE_0_FINDINGS.md (full route + Prisma isolation audit)  
**Scope:** Additive call-site changes only. No Prisma schema changes. No feature flags on security enforcement.

---

## Reconciliation Note — Phase 0 vs. Current Code

Before designing, the relevant source files were re-read. Two Phase 0 findings are already fixed in the current tree:

- **C-1** (`posts.ts:691`) — `getWorkspaceRole` IS present at lines 696–697. The finding was accurate at the time of the original Phase 0 session but was resolved before this Phase 1 session. **C-1 is closed.**
- **H-5** (`socialAccounts.ts:366–374`) — `encryptToken()` IS called at line 364 for all platforms (not just LinkedIn). The `encryptedAccessToken` variable is used for every write path. **H-5 is closed.**

All remaining findings (H-1, H-2, H-3, H-4, M-1 through M-5, L-1 through L-4, C-2, C-3) are confirmed open in current code and addressed below.

---

## Section 1 — Central Tenant Guard

### Module: `apps/api/src/lib/tenantGuard.ts`

This module is the single source of truth for workspace membership verification. It replaces the six independently-defined local helpers (`getWorkspaceRole`, `checkWorkspaceAccess`, `canAccessWorkspace`, `checkOwnerOrAdmin`, `getWorkspaceMembership`, `requireOwnerOrAdmin`). Those local helpers remain in their files during Phase 2 — only the call sites that need fixing are migrated, keeping the diff minimal and verifiable by grep.

---

### Exported Types

```typescript
import { prisma } from './prisma.js'
import { sendError } from './apiError.js'  // NOT used here — caller uses TenantAccessError
import { env } from '../config/env.js'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface WorkspaceMembership {
  workspaceId: string
  userId: string
  role: Role
}

export class TenantAccessError extends Error {
  constructor(
    public readonly statusCode: 400 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TenantAccessError'
  }
}
```

---

### Export 1: `assertWorkspaceAccess`

```typescript
/**
 * Verify that userId is a member of workspaceId and optionally meets a minimum role.
 *
 * Role hierarchy: OWNER > ADMIN > MEMBER
 * If minRole is 'ADMIN', OWNER also passes (OWNER > ADMIN).
 * If minRole is 'OWNER', only OWNER passes.
 *
 * @param workspaceId  - the workspace ID from the route (req.params, req.query, req.body)
 * @param userId       - MUST come from req.user!.id (JWT-verified); never from client input
 * @param minRole      - optional minimum role; omit to allow any member
 * @returns WorkspaceMembership on success
 * @throws TenantAccessError(400) if workspaceId is falsy or not a non-empty string
 * @throws TenantAccessError(403) if no membership exists or role is below minRole
 */
export async function assertWorkspaceAccess(
  workspaceId: string | undefined | null,
  userId: string,
  minRole?: Role,
): Promise<WorkspaceMembership>
```

**Internal logic (pseudo-code for Phase 2 implementer):**

1. If `!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim() === ''`:  
   throw `new TenantAccessError(400, 'MISSING_WORKSPACE_ID', 'workspaceId is required')`

2. Fetch workspace: `prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } })`  
   If null: throw `new TenantAccessError(403, 'FORBIDDEN', 'Workspace not found or access denied')`

3. If `workspace.ownerId === userId`: resolved role = `'OWNER'`  
   Else fetch member: `prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })`  
   If null: throw `new TenantAccessError(403, 'FORBIDDEN', 'Workspace not found or access denied')`  
   Resolved role = `membership.role as Role`

4. If `minRole` is provided, check hierarchy:  
   - `ROLE_RANK = { OWNER: 3, ADMIN: 2, MEMBER: 1 }`  
   - If `ROLE_RANK[resolvedRole] < ROLE_RANK[minRole]`: throw `new TenantAccessError(403, 'INSUFFICIENT_ROLE', 'Insufficient role for this action')`

5. Return `{ workspaceId, userId, role: resolvedRole }`

**Note:** Two DB queries (workspace + member) are the same cost as all existing local helpers. Do not collapse to one query — the `ownerId` check must happen before the member lookup to preserve OWNER semantics.

---

### Export 2: `assertResourceBelongsToWorkspace`

```typescript
/**
 * Synchronous cross-verification that a fetched resource belongs to the asserted workspace.
 * Call this AFTER fetching a resource by ID and AFTER calling assertWorkspaceAccess.
 *
 * Prevents the ID-swap attack: attacker in workspace A uses a valid workspace A token
 * but supplies a postId/mediaId/linkId belonging to workspace B.
 *
 * @param resourceWorkspaceId  - the workspaceId field on the fetched DB record
 * @param claimedWorkspaceId   - the workspaceId that was passed to assertWorkspaceAccess
 * @throws TenantAccessError(403) if they don't match
 */
export function assertResourceBelongsToWorkspace(
  resourceWorkspaceId: string,
  claimedWorkspaceId: string,
): void
```

**Internal logic:** `if (resourceWorkspaceId !== claimedWorkspaceId) throw new TenantAccessError(403, 'RESOURCE_WORKSPACE_MISMATCH', 'Resource does not belong to the specified workspace')`

---

### Exports 3 and 4: `createOAuthState` / `verifyOAuthState`

These replace the current `Buffer.from(JSON.stringify(statePayload)).toString('base64url')` pattern in `socialAccounts.ts:27`.

```typescript
/**
 * Create a tamper-proof OAuth state token.
 * Format: `<nonce>.<hmac-sha256-hex>`
 * Payload is HMAC-signed with JWT_SECRET. The nonce encodes the data as base64url(JSON).
 * The HMAC covers the entire nonce string so any payload modification invalidates the signature.
 *
 * @param workspaceId   - the workspace initiating the OAuth flow (from assertWorkspaceAccess result)
 * @param userId        - req.user!.id of the initiating user
 * @param platform      - one of the VALID_PLATFORMS values
 * @param pkceVerifier  - optional PKCE code verifier for PKCE flows
 * @returns opaque state string safe to pass as OAuth state parameter
 */
export function createOAuthState(
  workspaceId: string,
  userId: string,
  platform: string,
  pkceVerifier?: string,
): string

/**
 * Verify and decode an OAuth state token.
 * Checks: (1) HMAC signature is valid, (2) stored userId === the passed userId.
 *
 * @param state   - the raw state query parameter from the OAuth callback
 * @param userId  - the authenticated user's ID. Pass req.user.id if callback has requireAuth;
 *                  pass the userId from a server-side nonce store if callback is public.
 *                  See C-3 fix notes for the public-callback pattern.
 * @returns decoded payload on success
 * @throws TenantAccessError(400) if state is malformed or signature invalid
 * @throws TenantAccessError(403) if stored.userId !== passed userId
 */
export function verifyOAuthState(
  state: string,
  userId: string,
): { workspaceId: string; platform: string; pkceVerifier?: string }
```

**Internal logic for `createOAuthState`:**
```
nonce = base64url(JSON.stringify({ workspaceId, userId, platform, pkceVerifier, iat: Date.now() }))
sig   = createHmac('sha256', env.JWT_SECRET).update(nonce).digest('hex')
return `${nonce}.${sig}`
```

**Internal logic for `verifyOAuthState`:**
```
parts = state.split('.')
if parts.length !== 2 → throw TenantAccessError(400, 'INVALID_STATE', ...)
[nonce, sig] = parts
expectedSig = createHmac('sha256', env.JWT_SECRET).update(nonce).digest('hex')
if !timingSafeEqual(Buffer.from(sig,'hex'), Buffer.from(expectedSig,'hex')) → throw TenantAccessError(400, 'INVALID_STATE', ...)
payload = JSON.parse(Buffer.from(nonce, 'base64url').toString())
if typeof payload.workspaceId !== 'string' || !payload.workspaceId → throw TenantAccessError(400, 'INVALID_STATE', ...)
if payload.userId !== userId → throw TenantAccessError(403, 'STATE_USER_MISMATCH', ...)
return { workspaceId: payload.workspaceId, platform: payload.platform, pkceVerifier: payload.pkceVerifier }
```

**Note on `timingSafeEqual`:** Both buffers must be the same length for `timingSafeEqual` to work correctly. If `sig.length !== expectedSig.length` (i.e., `sig` is not a 64-char hex string), throw immediately before the comparison.

---

### Call-site replacement map

| Current local helper | Files currently defining it | Replace with `assertWorkspaceAccess` at these Phase 2 call sites |
|---|---|---|
| `getWorkspaceRole(workspaceId, userId)` | `posts.ts`, `queue.ts`, `approvals.ts`, `outcomeAnalytics.ts`, `tradeflow.ts` | `analytics.ts:274,315` (H-1); `ai.ts:832,880,963,1048` (H-2, H-3, M-4); `digest.ts:12` (M-2); `media.ts:65,79,107` (H-4) |
| `checkWorkspaceAccess(workspaceId, userId)` | `analytics.ts` | same as above for analytics endpoints |
| `canAccessWorkspace(workspaceId, userId)` | `bio.ts`, `workspaces.ts` | no new call sites needed (bio authenticated routes already use it correctly) |
| `base64url(JSON)` OAuth state | `socialAccounts.ts:27` | replace `createOAuthState` at line 27; replace decode at callback with `verifyOAuthState` |

The local helpers in files that are **already correct** (posts.ts most routes, queue.ts outer check, workspaces.ts, bio.ts authenticated routes) are **not migrated** in Phase 2. Only the broken call sites listed in Section 3 are touched.

**Caller error-handling pattern (used at every new call site):**

```typescript
import { assertWorkspaceAccess, assertResourceBelongsToWorkspace, TenantAccessError } from '../lib/tenantGuard.js'

// In route handler:
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) {
    sendError(res, err.statusCode, err.code, err.message)
    return
  }
  throw err
}
```

For brevity, Phase 2 may extract this into a one-liner helper inside each file, or call it inline. The important constraint is that the `TenantAccessError` must propagate to the caller — it must never be swallowed by a generic `catch`.

---

## Section 2 — Query-level Enforcement Approach

A Prisma client extension is out of scope for Phase 1 (it requires schema changes and cannot be verified by grep on route files). The enforcement model for Phase 1 is:

### The "fail-closed" call-site contract

**Rule 1: assertWorkspaceAccess before any Prisma query on tenant data.**

Every handler that reads or writes rows scoped to a workspace must call `assertWorkspaceAccess(workspaceId, req.user!.id)` as its first async operation, before any `prisma.*` call. If `assertWorkspaceAccess` throws, the handler returns immediately. No query is ever issued for an unauthorized workspace.

**Rule 2: For ID-based routes, fetch resource then cross-verify.**

When a handler receives a resource ID (postId, mediaId, linkId) rather than a workspaceId:
1. Call `assertWorkspaceAccess(claimedWorkspaceId, req.user!.id)` first (gets role + confirms membership).
2. Fetch the resource by ID: `prisma.X.findUnique({ where: { id } })`.
3. If null, return 404.
4. Call `assertResourceBelongsToWorkspace(resource.workspaceId, claimedWorkspaceId)`.
5. Proceed with the operation.

This two-step pattern closes the ID-swap attack: even a valid member of workspace A cannot operate on resources owned by workspace B by guessing their IDs.

**Rule 3: For bulk operations (e.g. queue reorder), validate every ID.**

For `orderedIds` arrays and similar, the fix is to include `workspaceId` in the Prisma `where` clause of each update (e.g. `{ id, workspaceId }`). This delegates cross-verification to the DB in a single atomic operation per item. If the post does not belong to the workspace, Prisma returns a "record not found" error rather than updating a foreign-workspace record. See M-1 in Section 3 for the exact change.

**Rule 4: Public routes are handled by resource-scoped cross-verification, not membership checks.**

Routes intentionally without authentication (portalPublic.ts, bio.ts click, links.ts track) cannot call `assertWorkspaceAccess` because there is no authenticated user. For these routes the pattern is:
- Fetch the authoritative resource by the trusted token/slug parameter (which is server-assigned).
- Cross-verify that the user-supplied resource ID belongs to that trusted record's workspace.
- This closes the ID-swap attack without requiring authentication.

**Where this breaks down and how it is handled:**

| Case | Why assertWorkspaceAccess cannot be used | Mitigation |
|---|---|---|
| `POST /portal/:token/approve` and `/reject` | Public route — no req.user | Fetch portal by token → fetch post by postId → assert `post.workspaceId === portal.workspaceId` (see C-2 fix) |
| `POST /bio/public/:slug/click/:linkId` | Public route — no req.user | Fetch bio page by slug → fetch bioLink by linkId → assert `bioLink.bioPageId` resolves to the same page (or add per-IP rate limiting if bioLink lacks workspaceId; see M-3 fix) |
| `POST /links/:id/track` | requireAuth present but no workspaceId param | Fetch link by id → verify `link.workspaceId` is a workspace the caller is a member of (one extra assertWorkspaceAccess on the fetched workspaceId) |
| `analytics.worker.ts` (background, no HTTP request) | Not an HTTP handler | Out of scope for Phase 1; noted as deferred in Phase 0. Needs a separate data migration story. |

---

## Section 3 — Per-finding Fix List

### C-1: Cross-tenant data leak via `content-health` — CLOSED

**Status:** Already fixed in current code. `posts.ts:696–697` calls `getWorkspaceRole` before the Prisma query. No action needed in Phase 2.

---

### C-2: Portal approve/reject with no tenant boundary

**Severity:** CRITICAL  
**File:** `apps/api/src/routes/portalPublic.ts`  
**Lines to change:** 94–96 (approve handler), 128–130 (reject handler)

**Approve handler fix — insert after line 77, before the upsert block:**

```typescript
// After: const portal = await db.clientPortal.findUnique({ where: { token } })
// Add (line ~95, before the upsert try block):
const postCheck = await db.scheduledPost.findUnique({ where: { id: postId }, select: { workspaceId: true } })
if (!postCheck || postCheck.workspaceId !== portal.workspaceId) {
  sendError(res, 403, 'FORBIDDEN', 'Post does not belong to this portal')
  return
}
```

**Reject handler fix — same pattern, insert after line 111:**

```typescript
const postCheck = await db.scheduledPost.findUnique({ where: { id: postId }, select: { workspaceId: true } })
if (!postCheck || postCheck.workspaceId !== portal.workspaceId) {
  sendError(res, 403, 'FORBIDDEN', 'Post does not belong to this portal')
  return
}
```

**Why this is the right fix:** The portal token is server-issued and maps to exactly one workspace. Fetching the post and comparing `workspaceId` fields is a synchronous equality check that cannot be bypassed by an attacker who only controls `postId`. No authentication is needed; the token itself is the trust anchor.

**Prerequisite:** None. This fix is self-contained and does not require tenantGuard.ts.

---

### C-3: OAuth callback state fully attacker-controlled

**Severity:** CRITICAL  
**File:** `apps/api/src/routes/socialAccounts.ts`  
**Lines to change:** 27 (state creation in `/oauth/connect` handler), 62–72 (state parsing in `/oauth/callback` handler)

**Connect handler fix (line 27) — replace:**
```typescript
// BEFORE:
const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

// AFTER:
import { createOAuthState } from '../lib/tenantGuard.js'
const state = createOAuthState(workspaceId, req.user!.id, platform, pkceVerifier)
```

**Callback handler fix (lines 62–72) — replace the entire `parsedState` parsing block:**
```typescript
// BEFORE:
let parsedState: { platform: string; workspaceId: string; userId: string; pkceVerifier?: string }
try {
  parsedState = JSON.parse(Buffer.from(state ?? '', 'base64url').toString())
  if (!parsedState || typeof parsedState.workspaceId !== 'string' || !parsedState.workspaceId) {
    throw new Error('invalid_state')
  }
} catch {
  logger.warn({ state }, 'OAuth callback received invalid or tampered state parameter')
  res.redirect(`${webUrl}/dashboard/accounts?error=invalid_state`)
  return
}

// AFTER:
import { verifyOAuthState, TenantAccessError } from '../lib/tenantGuard.js'
// The callback is public (no requireAuth). We cannot pass req.user.id.
// Instead we extract userId from the signed state itself only AFTER signature verification.
// verifyOAuthState verifies the HMAC first, then returns payload.userId from the signed nonce.
// We pass the extracted userId back to the equality check inside verifyOAuthState.
// Implementation note: a special overload or internal helper is needed here — see below.
```

**Special handling for the public callback:** `verifyOAuthState` as designed requires a `userId` argument to cross-check against the signed payload. But the callback has no authenticated user. The resolution:

- Add a second export `extractOAuthStatePayload(state: string): { workspaceId, platform, userId, pkceVerifier? }` that verifies the HMAC signature and returns the full payload (including `userId`) **without** checking userId against an external value.
- In the callback, call `extractOAuthStatePayload(state)` to get the payload. The HMAC check still prevents tampering.
- The security property is maintained because the HMAC is keyed on `JWT_SECRET`. An attacker cannot forge a state with an arbitrary `userId` without knowing `JWT_SECRET`. The userId in the signed payload is what was set by the authenticated `/oauth/connect` call.

```typescript
// Callback (replace lines 62–72):
import { extractOAuthStatePayload, TenantAccessError } from '../lib/tenantGuard.js'

let parsedState: { platform: string; workspaceId: string; userId: string; pkceVerifier?: string }
try {
  parsedState = extractOAuthStatePayload(state ?? '')
} catch (err) {
  if (err instanceof TenantAccessError) {
    logger.warn({ state }, 'OAuth callback received invalid or tampered state parameter')
    res.redirect(`${webUrl}/dashboard/accounts?error=invalid_state`)
    return
  }
  throw err
}
```

**Additional export needed in tenantGuard.ts:**

```typescript
/**
 * Verify HMAC signature and return the full OAuth state payload including userId.
 * Use this ONLY in the public OAuth callback where req.user is not available.
 * The HMAC signature guarantees the payload was created by this server.
 *
 * @throws TenantAccessError(400) if state is malformed or HMAC invalid
 */
export function extractOAuthStatePayload(
  state: string,
): { workspaceId: string; userId: string; platform: string; pkceVerifier?: string }
```

**Why this is the right fix:** The current code trusts a base64-encoded JSON blob entirely. The fix makes the state a server-signed token. An attacker who controls the `state` parameter at callback time cannot forge a valid signature without `JWT_SECRET`. The userId, workspaceId, and platform in the payload are whatever the authenticated user set at connect time — not attacker-controlled.

**Prerequisite:** tenantGuard.ts must exist with `createOAuthState` and `extractOAuthStatePayload` exported.

**Kill switch note:** The OAuth state format change is a breaking change for any OAuth flows that were initiated before the fix is deployed (in-flight flows). In-flight flows will have old-format states (plain base64url JSON, no HMAC). When the new callback code is deployed, those in-flight states will fail HMAC verification and redirect to `?error=invalid_state`. Users will simply need to restart the OAuth connect flow. This is acceptable and expected behavior — there is no need for a feature flag. The window of user-visible impact is the duration of any in-flight OAuth flows at deployment time (typically seconds to minutes).

---

### H-1: Analytics endpoints with no membership check

**Severity:** HIGH  
**File:** `apps/api/src/routes/analytics.ts`  
**Lines to change:** 274 (platform-comparison handler start), 315 (hashtag-performance handler start)

**platform-comparison fix — insert after line 276 (`if (!workspaceId)` check), before line 278 (`const since = ...`):**

```typescript
// Add lines ~277–281:
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}
```

**hashtag-performance fix — same pattern, insert after line 317 (`if (!workspaceId)` check), before line 319 (`const since = ...`):**

```typescript
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}
```

**Why this is the right fix:** Both handlers already have the `if (!workspaceId)` guard and already have `workspaceId` in the Prisma `where` clause. The only missing piece is membership verification. A two-line `assertWorkspaceAccess` call before the Prisma query is the minimal correct fix.

**Prerequisite:** tenantGuard.ts must exist.

---

### H-2: AI repurpose/suggestions leaks all workspaces when workspaceId omitted

**Severity:** HIGH  
**File:** `apps/api/src/routes/ai.ts`  
**Lines to change:** 881 (handler parameter destructuring line)

**Fix — replace lines 881–889:**

```typescript
// BEFORE:
const { workspaceId, limit = '10' } = req.query as { workspaceId?: string; limit?: string }

const take = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50)
const since = new Date()
since.setDate(since.getDate() - 90)

const posts = await prisma.scheduledPost.findMany({
  where: {
    ...(workspaceId ? { workspaceId } : {}),

// AFTER:
const { workspaceId, limit = '10' } = req.query as { workspaceId?: string; limit?: string }
if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }

try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}

const take = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50)
const since = new Date()
since.setDate(since.getDate() - 90)

const posts = await prisma.scheduledPost.findMany({
  where: {
    workspaceId,
```

The `...(workspaceId ? { workspaceId } : {})` spread must also be replaced with the plain `workspaceId` property — the optional spread is the root cause of the all-workspaces leak. Since workspaceId is now required and validated, the spread is no longer needed.

**Why this is the right fix:** Two changes together close the finding: (1) require workspaceId (return 400 if absent), (2) verify membership. The spread removal is not optional — leaving it in would reintroduce the unfiltered query if someone bypassed the 400 check.

**Prerequisite:** tenantGuard.ts must exist.

---

### H-3: AI brand-voice endpoints with no membership check

**Severity:** HIGH  
**File:** `apps/api/src/routes/ai.ts`  
**Lines to change:** 963 (`GET /brand-voice` handler), 1048 (`POST /brand-voice/generate` handler)

**brand-voice GET fix — insert after line 968 (`if (!workspaceId)` check), before line 970 (`try {`):**

```typescript
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}
```

**brand-voice/generate POST fix — insert after line 1061 (`if (!workspaceId)` check), before line 1062 (`if (!topic?.trim())`):**

```typescript
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}
```

**Why this is the right fix:** Both handlers already validate that `workspaceId` is present. Membership verification is the only missing step.

**Prerequisite:** tenantGuard.ts must exist.

---

### H-4: Media router has zero tenant enforcement

**Severity:** HIGH  
**File:** `apps/api/src/routes/media.ts`  
**Lines to change:** 65–69 (GET /), 73–99 (POST /), 102–111 (POST /upload), 153–163 (PATCH /library/:id), 165–174 (DELETE /library/:id), 176–189 (DELETE /:id)

**GET / fix — insert after line 67 (`if (!workspaceId)` check):**

```typescript
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { res.status(err.statusCode).json({ error: err.message }); return }
  throw err
}
```

Note: media.ts uses `res.status().json({ error })` pattern rather than `sendError()`. Match the existing style.

**POST / fix — insert after line 79 (`if (!workspaceId)` check):**

Same pattern as GET /, using `workspaceId` from `req.body`.

**POST /upload fix — insert after `if (!req.file)` check (line 107):**

This endpoint does not accept a `workspaceId` parameter at all. The minimal fix is to require `workspaceId` in the request body and add the membership check:

```typescript
const { workspaceId } = req.body as { workspaceId?: string }
if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return }
try {
  await assertWorkspaceAccess(workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { res.status(err.statusCode).json({ error: err.message }); return }
  throw err
}
```

**PATCH /library/:id fix — replace lines 154–162 entirely:**

```typescript
router.patch('/library/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { tags, workspaceId } = req.body as { tags?: string[]; workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
    const asset = await (prisma as any).mediaAsset.findUnique({ where: { id } })
    if (!asset) { sendError(res, 404, 'NOT_FOUND', 'Asset not found'); return }
    assertResourceBelongsToWorkspace(asset.workspaceId, workspaceId)
    const updated = await (prisma as any).mediaAsset.update({ where: { id }, data: { tags: tags ?? [] } })
    res.json({ asset: updated })
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update asset')
  }
})
```

**DELETE /library/:id fix — same pattern as PATCH:**

```typescript
router.delete('/library/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  const { workspaceId } = req.body as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'VALIDATION_ERROR', 'workspaceId required'); return }
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id)
    const asset = await (prisma as any).mediaAsset.findUnique({ where: { id } })
    if (!asset) { sendError(res, 404, 'NOT_FOUND', 'Asset not found'); return }
    assertResourceBelongsToWorkspace(asset.workspaceId, workspaceId)
    await (prisma as any).mediaAsset.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete asset')
  }
})
```

**DELETE /:id (flat file store) fix — insert after `if (idx === -1)` check (line 181):**

```typescript
// After fetching from flat store, verify ownership:
const removed_candidate = assets[idx]
if (!removed_candidate.workspaceId) { res.status(403).json({ error: 'Forbidden' }); return }
// We need a workspaceId from the caller to verify against
const { workspaceId: callerWorkspaceId } = req.query as { workspaceId?: string }
if (!callerWorkspaceId) { res.status(400).json({ error: 'workspaceId required' }); return }
try {
  await assertWorkspaceAccess(callerWorkspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { res.status(err.statusCode).json({ error: err.message }); return }
  throw err
}
if (removed_candidate.workspaceId !== callerWorkspaceId) { res.status(403).json({ error: 'Forbidden' }); return }
```

**Why this is the right fix:** The media router has `requireAuth` on every route but completely skips membership verification. Adding `assertWorkspaceAccess` before any data operation closes the membership gap. For ID-based operations (PATCH, DELETE), the additional `assertResourceBelongsToWorkspace` call closes the ID-swap gap.

**Client-side impact:** PATCH and DELETE `/library/:id` currently do not require `workspaceId` in the body. Adding it is a minor API change — the frontend must supply it. This is the correct design (the caller knows which workspace context they are operating in).

**Prerequisite:** tenantGuard.ts must exist.

---

### H-5: OAuth tokens stored without encryption for non-LinkedIn platforms — CLOSED

**Status:** Already fixed in current code. `socialAccounts.ts:364` calls `encryptToken(accessToken)` and the result is used for all platforms. No action needed in Phase 2.

---

### M-1: Queue reorder updates posts from other workspaces

**Severity:** MEDIUM  
**File:** `apps/api/src/routes/queue.ts`  
**Lines to change:** 108–115 (the `$transaction` block)

**Fix — add `workspaceId` to the `where` clause of each update:**

```typescript
// BEFORE:
await prisma.$transaction(
  orderedIds.map((id, index) =>
    (prisma.scheduledPost.update as Function)({
      where: { id },
      data: { queuePosition: index + 1 },
    }),
  ),
)

// AFTER:
await prisma.$transaction(
  orderedIds.map((id, index) =>
    (prisma.scheduledPost.update as Function)({
      where: { id, workspaceId },
      data: { queuePosition: index + 1 },
    }),
  ),
)
```

**Why this is the right fix:** The outer `getWorkspaceRole` check at line 104 already verifies membership. The only gap is that individual post IDs in `orderedIds` are not cross-verified. Adding `workspaceId` to the `where` clause means Prisma will fail to find (and therefore fail to update) any post whose `workspaceId` does not match the verified workspace. Prisma's `update` throws `P2025` ("record not found") for non-matching records, which is caught by the `catch (err)` at line 117 and returns a 500. If stricter error handling is desired, Phase 2 can catch `P2025` specifically and return 403 — but the security property (no cross-workspace mutation) is satisfied by either behavior.

**Prerequisite:** None. The `workspaceId` variable is already in scope at this location.

---

### M-2: Digest trigger has no workspace access check

**Severity:** MEDIUM  
**File:** `apps/api/src/routes/digest.ts`  
**Lines to change:** 11–19 (the entire route handler)

**Fix — replace the handler body:**

```typescript
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId } = req.body as { workspaceId?: string }
  if (!workspaceId) { sendError(res, 400, 'MISSING_FIELD', 'workspaceId is required'); return }
  try {
    await assertWorkspaceAccess(workspaceId, req.user!.id, 'ADMIN')
    sendWeeklyDigest(workspaceId).catch(() => {})
    res.json({ message: 'Digest queued' })
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to send digest')
  }
})
```

Two changes: (1) require `workspaceId` — disabling the "send for all workspaces" path, (2) require at minimum `ADMIN` role — digest triggers should not be available to `MEMBER` role.

**Why this is the right fix:** Any authenticated user being able to trigger a digest for any workspace (or all workspaces by omitting workspaceId) is a privilege escalation and potential spam/abuse vector. Requiring ADMIN or above scopes the trigger to workspace administrators.

**Prerequisite:** tenantGuard.ts must exist.

---

### M-3: Click-tracking has no workspace boundary

**Severity:** MEDIUM

#### M-3a: `links.ts:103` — `POST /links/:id/track`

**File:** `apps/api/src/routes/links.ts`  
**Lines to change:** 103–114

**Fix — replace the handler:**

```typescript
router.post('/:id/track', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const link = await (prisma as any).shortLink.findUnique({ where: { id }, select: { workspaceId: true, clicks: true } })
    if (!link) { sendError(res, 404, 'NOT_FOUND', 'Link not found'); return }
    await assertWorkspaceAccess(link.workspaceId, req.user!.id)
    const updated = await (prisma as any).shortLink.update({
      where: { id },
      data: { clicks: { increment: 1 } },
    })
    res.json({ clicks: updated.clicks })
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to track click')
  }
})
```

The pattern is: fetch resource → get its workspaceId → assertWorkspaceAccess. This avoids requiring the caller to supply a workspaceId parameter (the link ID alone is sufficient to derive the workspace).

#### M-3b: `bio.ts:50` — `POST /bio/public/:slug/click/:linkId`

**File:** `apps/api/src/routes/bio.ts`  
**Lines to change:** 49–60

This is a **public route** — no authentication. The click-tracking serves public UX analytics (bio link pages are intended for public use). The Phase 0 finding identifies it as "metric inflation" risk.

**Fix:** Add per-IP rate limiting via an in-memory counter or a lightweight Redis key. This is the appropriate mitigation for a genuinely public analytics endpoint — adding auth would break the public bio link UX.

Specific implementation: add an `ipRateLimiter` (using `express-rate-limit` which is already a standard Express pattern, or a Redis-based counter using the existing Redis connection) that limits to 10 clicks per IP per `linkId` per 24 hours. The exact rate limit values are left to Phase 2 judgment.

Note: If `express-rate-limit` is not already a dependency, the fallback is an in-memory Map keyed on `${ip}:${linkId}` with a TTL check. This is acceptable for a low-severity, medium-traffic endpoint.

**Prerequisite for M-3a:** tenantGuard.ts must exist. M-3b has no prerequisite.

---

### M-4: AI repurpose loads post without workspace membership check

**Severity:** MEDIUM  
**File:** `apps/api/src/routes/ai.ts`  
**Lines to change:** 832–833 (post fetch), insert check after line 833

**Fix — insert after `if (!post)` check (line 833), before `const promptMap` (line 835):**

```typescript
// After: if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }
// Add:
try {
  await assertWorkspaceAccess(post.workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
  throw err
}
// Optional but recommended — if caller also supplied workspaceId, cross-verify:
if (workspaceId && workspaceId !== post.workspaceId) {
  sendError(res, 403, 'RESOURCE_WORKSPACE_MISMATCH', 'Post does not belong to the specified workspace')
  return
}
```

**Why this is the right fix:** The handler fetches the post by `postId` without checking who the post belongs to. The plan gate check on the separately-supplied `workspaceId` (line ~831, not shown here) checks the workspace plan limit but does not verify the post belongs to that workspace. Calling `assertWorkspaceAccess(post.workspaceId, req.user!.id)` binds the membership check to the post's actual workspace, closing the gap.

**Prerequisite:** tenantGuard.ts must exist.

---

### M-5: No AbortSignal.timeout on direct platform API fetch calls

**Severity:** MEDIUM  
**File:** `apps/api/src/workers/publishPost.worker.ts`  
**Lines to change:** 85 (X/Twitter fetch), 97 (Facebook fetch), 111 (Instagram fetch — first leg of two-step flow)

**Fix for each fetch call — add `signal` option:**

```typescript
// BEFORE (example at line 85):
const twitterRes = await fetch('https://api.twitter.com/2/tweets', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ text }),
})

// AFTER:
const twitterRes = await fetch('https://api.twitter.com/2/tweets', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ text }),
  signal: AbortSignal.timeout(15_000),
})
```

Apply the same `signal: AbortSignal.timeout(15_000)` addition to lines 97 and 111. The 15-second timeout is consistent with the existing `webhookEmitter.ts:15` pattern (which uses 5 seconds — 15 seconds is appropriate for heavier publish operations).

**Why this is the right fix:** `AbortSignal.timeout()` is built into Node.js 18+ and requires zero new dependencies. It bounds the maximum time a single fetch call can stall a BullMQ worker. A stalled fetch without a timeout can hold a worker thread indefinitely, reducing concurrency for all tenants.

**Prerequisite:** None. This is a self-contained change with no dependency on tenantGuard.ts.

---

### L-1: No shared tenant-enforcement library

**Severity:** LOW  
**Resolution:** Addressed by creating `apps/api/src/lib/tenantGuard.ts` in Phase 2 (this document's Section 1). The per-finding call-site changes in this section migrate the broken call sites. Correct existing call sites are left using their local helpers — they are not migrated in Phase 2 to keep the diff minimal. A follow-up cleanup pass (Phase 3 or later) can migrate all remaining local helpers to `assertWorkspaceAccess` and delete the duplicates.

---

### L-2: Client portal tokens never expire

**Severity:** LOW  
**File:** `apps/api/src/routes/clientPortal.ts`  
**Fix:** Add an `expiresAt` field to the `ClientPortal` model (requires a Prisma migration) and check it at portal access time. This requires a schema change and is deferred to a separate migration story. Phase 2 does not touch this.

**Interim mitigation:** The `active` boolean field already exists and is checked at every portal access point. Admins can deactivate portals manually. Document this as the operational control until `expiresAt` is implemented.

---

### L-3: TikTok and Google posts silently succeed without publishing

**Severity:** LOW  
**File:** `apps/api/src/workers/publishPost.worker.ts`  
**Lines to change:** 143–145 (platform return values), and the status-update logic at ~395–420

**Fix:** Instead of returning `${platform}_manual_required` into `responseLog`, return these platforms into a separate `manualRequired` map. After the per-platform loop, check both maps:
- If `Object.keys(responseLog).length === 0 && Object.keys(manualRequired).length > 0` → set status to `'MANUAL_REQUIRED'` (or a new enum value)
- If `Object.keys(responseLog).length > 0` → set status to `'PUBLISHED'` (actual publish occurred)

This requires adding `MANUAL_REQUIRED` to the `ScheduledPost` status enum in the Prisma schema. Because it requires a schema change, Phase 2 should either (a) defer it with a schema-migration story, or (b) implement a simpler no-schema version: write to `responseLog` with a `manual_required` marker but set DB status to `'PENDING'` rather than `'PUBLISHED'`. The simpler version is preferred for Phase 2.

---

### L-4: Flat file media store has no write locking

**Severity:** LOW  
**File:** `apps/api/src/routes/media.ts`  
**Fix:** Replace `readStore`/`writeStore` with an async mutex (e.g. a simple Promise-based lock or the `async-mutex` package). Alternatively — and this is the preferred long-term fix — migrate the flat-file media store to the `MediaAsset` Prisma model, which is already present in the codebase (`media.ts:113+` already uses `prisma.mediaAsset`). The flat file is legacy; the Prisma-backed `/library` endpoints are the forward path.

Phase 2 should add a brief mutex to `readStore`/`writeStore` as the minimal fix, and note the migration in a TODO comment. Full migration to Prisma-backed storage is a separate story.

---

## Section 4 — Feature Flag Note

### TENANT_GUARD_STRICT is not needed

**Security enforcement is always-on. There is no opt-out.**

An auth fix that is off by default is not a fix — it is a commented-out fix. The purpose of fixing an authorization vulnerability is to prevent unauthorized access. A feature flag on auth enforcement means:
1. The vulnerability remains exploitable by default after deployment.
2. Any mistake in flag configuration (wrong env var, wrong default) keeps the system exploitable.
3. Security teams cannot rely on deployment of the fix as evidence of remediation — they must also verify flag state across all environments.
4. Emergency rollback of a security fix should be done by reverting the deployment, not by toggling a flag.

The correct rollback plan for any of these fixes is a git revert and redeployment — not a kill switch.

### The one justified narrow exception: OAuth state format (C-3)

The `createOAuthState`/`extractOAuthStatePayload` change alters the format of the OAuth `state` parameter. Any OAuth flow initiated before deployment will have an old-format state (plain base64url JSON). When the new callback code is deployed, those old states will fail HMAC verification.

**This is acceptable and expected behavior**, not a bug. The impact is:
- Any user who clicked "Connect [platform]" in the 30–90 seconds before deployment and has not yet completed the redirect will see an `invalid_state` error.
- They retry the connect flow, which now succeeds with the new signed state.

This does not warrant a feature flag. The correct operational note is: deploy during low-traffic hours if possible, and communicate to support that a small number of OAuth connect failures may occur during the deployment window.

**No kill switch is needed for any Phase 1 fix.**
