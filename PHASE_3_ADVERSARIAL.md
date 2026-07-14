# OmniPulse — Phase 3 Adversarial Self-Check

**Author:** Claude (claude-sonnet-4-6), adversarial review only — no source files modified  
**Date:** 2026-07-13  
**Scope:** Attack the Phase 2 fixes. Find what still breaks.

---

## Scenario 1 — "Forgotten Route"

**Attack:** A developer adds `GET /api/v1/ai/tone-analysis?workspaceId=X` next month and forgets to call `assertWorkspaceAccess`. Does any other layer catch the miss?

### Does tenantGuard.ts have any Prisma-level extension that would block the query automatically?

**No. FAIL.**

`apps/api/src/lib/tenantGuard.ts` contains zero Prisma middleware or client extensions. It exports four functions (`assertWorkspaceAccess`, `assertResourceBelongsToWorkspace`, `createOAuthState`, `extractOAuthStatePayload`) that are synchronous helpers — they do nothing unless explicitly called. There is no `prisma.$use()`, no `prisma.$extends()`, no query-level middleware. Every Prisma query on tenant data runs unguarded unless the route handler explicitly calls the guard first. If a developer skips the call, the query executes without any interception.

Evidence: tenantGuard.ts lines 1–154 — the entire file. There is no Prisma client construction, extension, or middleware registration anywhere in the file.

### Do the static guard-presence tests in tenantIsolation.test.ts cover this new route?

**No. FAIL.**

`apps/api/src/routes/__tests__/tenantIsolation.test.ts` Section B contains static assertions that grep the source of exactly 10 files: `analytics.ts`, `ai.ts`, `portalPublic.ts`, `digest.ts`, `links.ts`, `media.ts`, `queue.ts`, `socialAccounts.ts`, and `tenantGuard.ts` itself. A new route file (`ai.ts` endpoint, a new route, or any file not in that list) has no corresponding test assertion. The test suite does not enumerate all routes, does not enforce a schema like "every route file must import `assertWorkspaceAccess`", and does not fail if a new route is added without coverage.

Evidence: tenantIsolation.test.ts lines 308–427 — the describe block explicitly names each file and does not include any route-discovery logic.

### What is the actual residual risk?

**High and unmitigated.**

The entire enforcement model is call-site convention, not infrastructure. The 35 route files in `apps/api/src/routes/` include `campaigns.ts`, `approvals.ts`, `reports.ts`, `rss.ts`, `listening.ts`, `inbox.ts`, `templates.ts`, `outcomeAnalytics.ts`, `tradeflow.ts`, `seo.ts`, `seoData.ts`, and others that were not part of Phase 2. Each defines its own local `checkXxxAccess` helper (confirmed in `campaigns.ts`) or has not been audited for this review. None of these routes are covered by the Phase 2 guard or the Phase 2 tests. A future developer writing a new route has no automated enforcement mechanism to catch a missing guard. Code review is the only gate.

### Is there anything that catches the mistake at deploy time?

**No.**

There is no lint rule enforcing `assertWorkspaceAccess` presence. There is no Prisma extension intercepting tenant-scoped queries. The static tests in tenantIsolation.test.ts only cover the 10 files explicitly named — they cannot detect new files. CI running the existing test suite would pass even if a new route with a cross-tenant read was deployed.

**Additional fix required:**

1. Add a Prisma query middleware or client extension in `apps/api/src/lib/prisma.ts` that injects `workspaceId` into reads on tenant-scoped models, OR
2. Add a lint rule (e.g. a custom ESLint rule or a pre-commit grep) that rejects any new route handler that queries `prisma.scheduledPost`, `prisma.socialAccount`, `prisma.mediaAsset`, `prisma.shortLink`, `prisma.clientPortal`, or `prisma.postAnalytics` without a preceding `assertWorkspaceAccess` call in the same handler scope, OR
3. Expand the static tests in tenantIsolation.test.ts to enumerate all route files in the directory and assert each one either imports `assertWorkspaceAccess` or is explicitly allowlisted as a public/non-tenant route.

Until one of these is in place, every new route is one forgotten call away from a cross-tenant data leak.

---

## Scenario 2 — "Job Smuggler"

**Attack:** A BullMQ job is enqueued with a `tenantId` in its payload. Can a payload crafted by or for Tenant A operate on Tenant B rows?

### How does publishPost.worker.ts identify which workspace a job belongs to? Does it re-verify workspace membership?

**The worker trusts the job payload entirely. FAIL.**

`apps/api/src/workers/publishPost.worker.ts` lines 192–200:

```typescript
const worker = new Worker(
  'publish-post',
  async (job) => {
    const { postId } = job.data as { postId: string }

    const post = await (prisma.scheduledPost.findUnique as Function)({
      where: { id: postId },
      include: { platformVariants: true },
    })
    if (!post) {
      throw new Error(`ScheduledPost ${postId} not found`)
```

The worker receives `postId` from `job.data`, fetches the post by that ID, and proceeds. There is no call to `assertWorkspaceAccess`. There is no re-verification that the `postId` in the payload belongs to the workspace that enqueued the job. The worker has no concept of "which workspace owns this job" — it simply trusts the postId and operates on whatever post the DB returns.

### How are jobs enqueued? Is workspaceId in the payload verified at enqueue time?

**The job payload contains only `postId`. The workspace verification at enqueue time checks the post's workspace, not a separately supplied workspaceId. This is the correct pattern at the single enqueue site — but the worker does not re-verify.**

`apps/api/src/routes/queue.ts` lines 124–179, `PATCH /:id/dispatch`:

```typescript
const post = await (prisma.scheduledPost.findUnique as Function)({ where: { id } })
if (!post) { sendError(res, 404, 'NOT_FOUND', 'Post not found'); return }

const role = await getWorkspaceRole(post.workspaceId, req.user!.id)
if (!role) { sendError(res, 403, 'FORBIDDEN', 'Access denied'); return }
...
const job = await publishPostQueue.add(
  'publish-post',
  { postId: id },
  ...
)
```

At dispatch time, the handler verifies the caller is a member of `post.workspaceId`. The payload enqueued is `{ postId: id }` — it does not include workspaceId. This is correct for the single controlled enqueue path.

### Can an authenticated user in Workspace A enqueue a job that operates on Workspace B's posts or social accounts?

**Not via the normal dispatch route, but the worker is unsafe in the general case.**

Via `PATCH /api/v1/queue/:id/dispatch`: a user in Workspace A supplying a postId from Workspace B would be blocked because `getWorkspaceRole(post.workspaceId, req.user!.id)` would fail — the user is not a member of Workspace B. This path is closed.

However, the worker itself performs no membership check. Any party that can insert a job directly into the BullMQ Redis queue (e.g., a compromised Redis instance, a bug in another enqueue path, or any future code that calls `publishPostQueue.add` without the prior membership check) can cause the worker to operate on any post. The worker will:

1. Fetch the post by the supplied postId (no workspace filter)
2. Fetch social accounts for `post.workspaceId` (lines not in the read range, but implied by the publish flow)
3. Decrypt tokens and publish on behalf of that workspace

The worker's security depends entirely on the invariant that only the `dispatch` handler enqueues jobs, and that handler does the membership check. This is a fragile, non-enforced invariant.

**Additional fix required:**

The worker should re-verify workspace integrity as its first action after fetching the post:

```typescript
// After fetching post:
if (!post) throw new Error(`ScheduledPost ${postId} not found`)
// Re-verify the post belongs to a real workspace (defense in depth, not auth)
const workspace = await prisma.workspace.findUnique({ where: { id: post.workspaceId }, select: { id: true } })
if (!workspace) throw new Error(`Workspace ${post.workspaceId} not found — job rejected`)
```

A stronger fix would store `workspaceId` in the job payload at enqueue time and assert `post.workspaceId === job.data.workspaceId` in the worker before any operation. This catches payload tampering and drift.

---

## Scenario 3 — "ID Swap"

**Attack:** A user changes a resource ID in the URL/body to another tenant's ID.

### portalPublic.ts approve/reject: does the error message confirm the post exists in another workspace?

**The error message is safe — it does not confirm existence. PASS.**

`apps/api/src/routes/portalPublic.ts` lines 79–83 (approve) and 119–123 (reject):

```typescript
const postCheck = await db.scheduledPost.findUnique({ where: { id: postId }, select: { workspaceId: true } })
if (!postCheck || postCheck.workspaceId !== portal.workspaceId) {
  sendError(res, 403, 'FORBIDDEN', 'Post does not belong to this portal')
  return
}
```

Both `!postCheck` (post not found) and `postCheck.workspaceId !== portal.workspaceId` (post belongs to a different workspace) produce the same 403 response body: `{ error: 'Post does not belong to this portal' }`. The response does not distinguish between "post does not exist" and "post exists but belongs to another workspace." An attacker cannot use this endpoint to enumerate whether a foreign postId exists in the system.

**Note:** The error code is `'FORBIDDEN'` for both cases, which is consistent and correct.

### media.ts PATCH/DELETE /library/:id: does the 403 response reveal the asset exists?

**Yes. The 403 response confirms the asset exists in another workspace. FAIL.**

`apps/api/src/routes/media.ts` lines 175–190 (PATCH) and 193–207 (DELETE):

```typescript
const asset = await (prisma as any).mediaAsset.findUnique({ where: { id } })
if (!asset) { sendError(res, 404, 'NOT_FOUND', 'Asset not found'); return }
assertResourceBelongsToWorkspace(asset.workspaceId, workspaceId)
```

If the asset exists but belongs to a different workspace, `assertResourceBelongsToWorkspace` throws a `TenantAccessError` with code `'RESOURCE_WORKSPACE_MISMATCH'` and the message `'Resource does not belong to the specified workspace'`. This is caught and returned as a 403.

An attacker in Workspace A can supply an asset `id` from Workspace B:
- If the asset does not exist: 404 `{ error: 'Asset not found' }`
- If the asset exists but belongs to Workspace B: 403 `{ error: 'Resource does not belong to the specified workspace' }`

The difference in status code and error message confirms to the attacker that the asset ID exists in the system and belongs to a different workspace. This is an oracle for cross-tenant asset ID enumeration.

**Additional fix required:**

Collapse the 404 and 403 responses to the same response when the distinction would leak existence:

```typescript
const asset = await (prisma as any).mediaAsset.findUnique({ where: { id } })
if (!asset || asset.workspaceId !== workspaceId) {
  sendError(res, 404, 'NOT_FOUND', 'Asset not found')
  return
}
```

This removes the need for `assertResourceBelongsToWorkspace` in this context and returns 404 for both "not found" and "wrong workspace," closing the enumeration oracle.

### queue.ts reorder: does Prisma's P2025 error leak any information about the foreign post?

**The error response is a generic 500 that leaks nothing to the client. PASS with a caveat.**

`apps/api/src/routes/queue.ts` lines 107–120:

```typescript
await prisma.$transaction(
  orderedIds.map((id, index) =>
    (prisma.scheduledPost.update as Function)({
      where: { id, workspaceId },
      data: { queuePosition: index + 1 },
    }),
  ),
)
res.json({ success: true })
} catch (err) {
logger.error({ err }, 'Reorder queue error')
sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reorder queue')
}
```

When `id` belongs to a foreign workspace, Prisma throws P2025 (`Record to update not found`). This is caught by the generic `catch (err)` block and returned as a 500 `{ error: 'Failed to reorder queue' }`. The response body does not reveal the Prisma error code or the foreign postId.

The caveat: a 500 is architecturally wrong for what is effectively a 403/404 (the record wasn't updated because it doesn't belong to the workspace). A sophisticated attacker can distinguish "my IDs worked (200)" from "one of my IDs was foreign (500)" by observing the status code, allowing them to probe which IDs exist in other workspaces via binary search. This is a low-severity oracle, not a direct data leak.

**Improvement (not critical):** Catch P2025 specifically and return 422 or 400 without leaking existence details:

```typescript
} catch (err: any) {
  if (err?.code === 'P2025') {
    sendError(res, 422, 'INVALID_IDS', 'One or more post IDs are invalid for this workspace')
    return
  }
  sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reorder queue')
}
```

### links.ts track: does the 403 confirm the link exists in another workspace?

**Yes. The 403 confirms the link exists and the user is not a member of its workspace. FAIL.**

`apps/api/src/routes/links.ts` lines 104–118:

```typescript
router.post('/:id/track', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params
  try {
    const link = await (prisma as any).shortLink.findUnique({ where: { id }, select: { workspaceId: true, clicks: true } })
    if (!link) { sendError(res, 404, 'NOT_FOUND', 'Link not found'); return }
    await assertWorkspaceAccess(link.workspaceId, req.user!.id)
    ...
  } catch (err) {
    if (err instanceof TenantAccessError) { sendError(res, err.statusCode, err.code, err.message); return }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to track click')
  }
})
```

If an authenticated user in Workspace A supplies the `id` of a link belonging to Workspace B:
- The link is fetched successfully (no workspace filter on the fetch)
- `assertWorkspaceAccess(link.workspaceId, req.user!.id)` throws 403 `FORBIDDEN`

The response sequence is:
- Non-existent link ID: 404 `{ error: 'Link not found' }`
- Existing link in a foreign workspace: 403 `{ error: 'Workspace not found or access denied' }`

The distinct status codes confirm to the attacker that the link ID exists and belongs to a workspace they are not a member of. This is an existence oracle for cross-tenant short link IDs.

**Additional fix required:**

```typescript
const link = await (prisma as any).shortLink.findUnique({ where: { id }, select: { workspaceId: true, clicks: true } })
if (!link) { sendError(res, 404, 'NOT_FOUND', 'Link not found'); return }
try {
  await assertWorkspaceAccess(link.workspaceId, req.user!.id)
} catch (err) {
  if (err instanceof TenantAccessError) {
    // Return 404, not 403 — do not confirm the link exists in another workspace
    sendError(res, 404, 'NOT_FOUND', 'Link not found')
    return
  }
  throw err
}
```

---

## Scenario 4 — "Stale Session"

**Attack:** A user is removed from a workspace. They still hold a valid JWT. Do they retain access?

### Trace the exact code path

1. Request arrives with `Authorization: Bearer <token>`
2. `requireAuth` (`apps/api/src/middleware/auth.ts` line 23) verifies the JWT signature and expiry against `env.JWT_SECRET`
3. `requireAuth` line 41: queries `prisma.user.findUnique({ where: { id: payload.id }, select: { passwordChangedAt: true } })` — this is a live DB query, not cached
4. If `passwordChangedAt > iat`, returns 401 `TOKEN_REVOKED`; otherwise sets `req.user = payload` and calls `next()`
5. Route handler calls `assertWorkspaceAccess(workspaceId, req.user!.id)`
6. `assertWorkspaceAccess` (`tenantGuard.ts` lines 38–61): queries `prisma.workspace.findUnique` and `prisma.workspaceMember.findUnique` — both live DB queries

### Does assertWorkspaceAccess re-check the WorkspaceMember table each time?

**Yes. PASS on this specific question.**

`tenantGuard.ts` line 47: `prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })` is executed on every request that reaches the guard. There is no caching layer. If the `WorkspaceMember` row has been deleted, this query returns `null`, the function throws `TenantAccessError(403, 'FORBIDDEN', ...)`, and the handler returns 403.

**Window of access after removal:** Zero, if the route calls `assertWorkspaceAccess`. The membership check is synchronous with the request. Once the DB row is deleted, the next request to any guarded route is rejected.

### JWT revocation interaction

**This is where the model breaks. FAIL.**

`requireAuth` does **not** check workspace membership. It only verifies the JWT signature and optionally checks `passwordChangedAt`. The JWT payload contains `{ id, email, role }` — no workspace scoping.

If a workspace owner removes a member:
1. The `WorkspaceMember` row is deleted
2. The member's JWT remains valid (not expired, password unchanged)
3. The member makes a request to any **Phase 2-fixed route** that calls `assertWorkspaceAccess` → 403. Access denied correctly.
4. The member makes a request to any **unguarded route** (see Scenario 1: `campaigns.ts`, `approvals.ts`, the 25+ other routes not touched in Phase 2) → `requireAuth` passes (valid JWT), the route's local `checkXxxAccess` helper may or may not re-check membership. If it does, access is denied; if it doesn't, the stale session retains access.

The stale-session risk is not a failure of the Phase 2 fixes — it is the same Scenario 1 residual risk applied to the membership-check dimension. Any route that uses a local helper that does not query `workspaceMember` is vulnerable to stale sessions.

Additionally: there is no JWT blacklist (`jti` tracking). If an admin wants to immediately revoke a member's token (not just remove them from the workspace), they cannot — short of the member changing their password, the token remains valid until expiry. If the JWT has a long expiry (days or weeks), the stale token gives access to any route that does not call `assertWorkspaceAccess`.

### Is there any session/workspace caching in middleware or route handlers?

**No caching found in auth.ts or tenantGuard.ts.** The `requireAuth` middleware makes one DB query per request (`prisma.user.findUnique`). `assertWorkspaceAccess` makes two DB queries per call (`prisma.workspace.findUnique`, `prisma.workspaceMember.findUnique`). No memoization, no Redis caching, no in-memory map. For the guarded routes, the stale-session window is zero.

---

## Scenario 5 — "Include Leak"

**Attack:** Prisma `include` or `select` on a relation pulls in data from other tenants if the relation is not scoped.

### Audit of every include/nested select in the fixed files

---

**analytics.ts line 44–50** — `GET /` handler:

```typescript
const accounts = await prisma.socialAccount.findMany({
  where: { workspaceId },
  include: {
    snapshots: {
      orderBy: { recordedAt: 'asc' },
    },
  },
})
```

Top-level `where: { workspaceId }` scopes to the verified workspace. The `snapshots` relation is a foreign key child of `socialAccount` — it cannot belong to a different workspace because it is owned by the `socialAccount` row, which is already scoped. **PASS.**

---

**analytics.ts lines 86–89** — `GET /best-times` handler:

```typescript
const posts = await prisma.scheduledPost.findMany({
  where: { workspaceId, status: 'PUBLISHED' },
  select: { platforms: true, scheduledFor: true },
})
```

`select` only fetches scalar fields on the scoped `scheduledPost`. No related rows included. **PASS.**

---

**analytics.ts lines 130–135** — `GET /top-posts` handler:

```typescript
const posts = await (prisma.scheduledPost.findMany as Function)({
  where: { workspaceId, status: 'PUBLISHED' },
  include: { metrics: true },
  ...
})
```

Top-level `where: { workspaceId }`. The `metrics` relation (`postMetric`) is a child of `scheduledPost` via foreign key — cannot belong to a different workspace. **PASS.**

---

**analytics.ts lines 188–193** — `GET /insights` handler:

```typescript
const posts = await (prisma.scheduledPost.findMany as Function)({
  where: { workspaceId, status: 'PUBLISHED', scheduledFor: { gte: since } },
  include: { metrics: true },
  ...
})
```

Same pattern as top-posts. Scoped by `workspaceId`. `metrics` is a child relation. **PASS.**

---

**analytics.ts lines 288–293** — `GET /platform-comparison` handler:

```typescript
const metrics = await (prisma as any).postMetric.findMany({
  where: {
    post: { workspaceId, status: 'PUBLISHED', scheduledFor: { gte: since } },
  },
  select: { platform: true, likes: true, comments: true, shares: true, reach: true },
})
```

**This query uses a nested relation filter on `post` rather than a direct `workspaceId` on the `postMetric` model.** The `where: { post: { workspaceId } }` pattern is a Prisma relational filter — it restricts to `postMetric` rows whose parent `post` has the specified `workspaceId`. This is functionally correct and cannot leak metrics from other workspaces, because the parent scoping propagates through the relation. However, this relies on the Prisma ORM's relational filter behavior, not a direct column filter on `postMetric.workspaceId`. If `postMetric` has a `workspaceId` column directly, the direct filter would be more robust. **Functionally PASS but architecturally weaker than a direct column filter.**

---

**analytics.ts lines 336–341** — `GET /hashtag-performance` handler:

```typescript
const posts = await prisma.scheduledPost.findMany({
  where: { workspaceId, status: 'PUBLISHED', scheduledFor: { gte: since } },
  include: { metrics: true },
  ...
})
```

Scoped by `workspaceId`. `metrics` is a child relation. **PASS.**

---

**ai.ts line 833** — `POST /repurpose` handler:

```typescript
const post = await prisma.scheduledPost.findUnique({ where: { id: postId }, include: { metrics: true } })
```

This fetch is **not** scoped by `workspaceId`. It fetches any post by ID. The `metrics` include brings in child rows of that post — they cannot belong to a different workspace, but the post itself could. This is the M-4 finding that Phase 2 fixed by adding `assertWorkspaceAccess(post.workspaceId, req.user!.id)` after the fetch (ai.ts lines 836–840). The guard runs after the include but before any response is sent, so the metrics are never returned to an unauthorized caller. **Functionally PASS post-Phase 2, but the metrics are fetched before the access check — a defense-in-depth failure. The access check should be moved before the include, or the initial query should use `select` without metrics, with a follow-up include only after the access check passes.**

---

**ai.ts lines 903–912** — `GET /repurpose/suggestions` handler:

```typescript
const posts = await prisma.scheduledPost.findMany({
  where: {
    workspaceId,
    status: 'PUBLISHED',
    scheduledFor: { gte: since },
  },
  include: { metrics: true },
  ...
})
```

`assertWorkspaceAccess` is called before this query (lines 893–896). Top-level `where: { workspaceId }` scopes the fetch. `metrics` is a child relation. **PASS.**

---

**ai.ts lines 994–999** — `GET /brand-voice` handler:

```typescript
const posts = await prisma.scheduledPost.findMany({
  where: { workspaceId, status: 'PUBLISHED' },
  orderBy: { scheduledFor: 'desc' },
  take: 30,
  select: { content: true },
})
```

`assertWorkspaceAccess` called before this query (lines 987–990). `select: { content: true }` — no relation includes. **PASS.**

---

**ai.ts lines 1098–1103** — `POST /brand-voice/generate` handler:

```typescript
const posts = await prisma.scheduledPost.findMany({
  where: { workspaceId, status: 'PUBLISHED' },
  orderBy: { scheduledFor: 'desc' },
  take: 20,
  select: { content: true },
})
```

`assertWorkspaceAccess` called before this query (lines 1088–1092). No relation includes. **PASS.**

---

**media.ts line 139–148** — `GET /library` handler:

```typescript
const assets = await (prisma as any).mediaAsset.findMany({
  where: {
    workspaceId,
    ...(tag ? { tags: { has: tag } } : {}),
    ...(search ? { filename: { contains: search, mode: 'insensitive' } } : {}),
  },
  orderBy: { createdAt: 'desc' },
  take: 100,
})
```

**No `assertWorkspaceAccess` call in this handler. FAIL.**

`GET /library` at lines 135–152 takes `workspaceId` from `req.query` and queries `mediaAsset` directly without calling `assertWorkspaceAccess` or any other membership check. This is an unguarded route. Any authenticated user who knows another workspace's ID can enumerate that workspace's entire media library. Phase 2 fixed PATCH and DELETE `/library/:id` but left GET `/library` unguarded.

Evidence: media.ts lines 135–152. No `assertWorkspaceAccess`, no local `getWorkspaceRole`, no membership verification of any kind.

**Similarly:**

**media.ts lines 155–172** — `POST /library` handler:

```typescript
router.post('/library', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, url, filename, mimeType, size, tags } = req.body ...
  if (!workspaceId || !url || !filename) { sendError(res, 400, ...) return }
  try {
    const asset = await (prisma as any).mediaAsset.create({
      data: { workspaceId, url, filename, ... },
    })
```

No `assertWorkspaceAccess` call. Any authenticated user can write a `mediaAsset` record into any `workspaceId` by supplying an arbitrary workspace ID in the body. The record will be created in the target workspace's media library.

**This is a Phase 2 miss: two media.ts routes (`GET /library` and `POST /library`) were not fixed.**

**portalPublic.ts lines 25–68** — `GET /portal/:token` handler:

```typescript
const portal = await db.clientPortal.findUnique({
  where: { token },
  include: { workspace: true },
})
...
pendingPosts = await db.scheduledPost.findMany({
  where: {
    workspaceId: portal.workspaceId,
    status: { in: ['SCHEDULED', 'PENDING_REVIEW'] },
  },
  ...
  select: { id: true, content: true, platforms: true, scheduledFor: true, status: true },
})
```

The portal is fetched by its server-issued token. The workspace include brings in the portal's workspace (same workspace). Posts are fetched with `workspaceId: portal.workspaceId` — scoped to the portal's workspace. No cross-tenant include leak. **PASS.**

---

## Summary Table

| Scenario | Verdict | Primary Evidence |
|---|---|---|
| 1 — Forgotten Route | **FAIL** | No Prisma-level enforcement. Static tests cover only 10 named files. 25+ untouched routes have no automated guard check. |
| 2 — Job Smuggler | **FAIL (worker trust)** | publishPost.worker.ts:193 trusts postId from job payload with no re-verification. Single enqueue path is guarded but invariant is unenforced. |
| 3a — ID Swap: portalPublic approve/reject | **PASS** | portalPublic.ts:80–82 collapses null and mismatch into the same 403 message. |
| 3b — ID Swap: media PATCH/DELETE /library/:id | **FAIL (existence oracle)** | Distinct 404 vs 403 confirms cross-tenant asset exists. media.ts:182/200. |
| 3c — ID Swap: queue reorder | **PASS (with low-severity caveat)** | P2025 returns generic 500, not the foreign postId. queue.ts:117–119. |
| 3d — ID Swap: links track | **FAIL (existence oracle)** | Distinct 404 vs 403 confirms cross-tenant link exists. links.ts:108,109. |
| 4 — Stale Session | **PASS for guarded routes; FAIL for unguarded routes** | assertWorkspaceAccess queries WorkspaceMember live on every request. But 25+ unguarded routes remain. No JWT blacklist. |
| 5 — Include Leak (general) | **PASS** | All includes on fixed routes are scoped to the top-level workspaceId. |
| 5 — Include Leak: media.ts GET/POST /library | **FAIL (Phase 2 miss)** | media.ts:135–172 — GET /library and POST /library have no membership check at all. |
| 5 — Include Leak: ai.ts repurpose include-before-check | **PASS (functional) / weak** | metrics fetched before access check. Access check added post-fetch prevents return. ai.ts:833,837. |

---

## Critical Residual Vulnerabilities (Require Immediate Fix)

### RV-1: media.ts GET /library — unauthenticated workspace enumeration
**File:** `apps/api/src/routes/media.ts` lines 135–152  
**Risk:** Any authenticated user can enumerate the complete media library of any workspace by supplying its ID in `?workspaceId=`.  
**Fix:** Add `assertWorkspaceAccess(workspaceId, req.user!.id)` before the `prisma.mediaAsset.findMany` call.

### RV-2: media.ts POST /library — cross-workspace asset injection
**File:** `apps/api/src/routes/media.ts` lines 155–172  
**Risk:** Any authenticated user can create a `mediaAsset` record in any workspace by supplying an arbitrary `workspaceId` in the body.  
**Fix:** Add `assertWorkspaceAccess(workspaceId, req.user!.id)` before the `prisma.mediaAsset.create` call.

### RV-3: links.ts track — cross-tenant link existence oracle
**File:** `apps/api/src/routes/links.ts` lines 104–118  
**Risk:** Authenticated users can confirm whether a short link ID exists in a foreign workspace (404 vs 403 distinction).  
**Fix:** Return 404 (not 403) when `assertWorkspaceAccess` fails in this handler.

### RV-4: media.ts PATCH/DELETE /library/:id — cross-tenant asset existence oracle
**File:** `apps/api/src/routes/media.ts` lines 175–207  
**Risk:** Authenticated users can confirm whether a media asset ID exists in a foreign workspace (404 vs 403 distinction).  
**Fix:** Collapse the 404/403 to a single 404 when the asset does not belong to the caller's workspace.

### RV-5: publishPost.worker.ts — job payload fully trusted without re-verification
**File:** `apps/api/src/workers/publishPost.worker.ts` lines 192–200  
**Risk:** Any party that can inject a job into the BullMQ queue (compromised Redis, future enqueue path without membership check) can operate on any workspace's posts and social accounts.  
**Fix:** Store `workspaceId` in the job payload at enqueue time; assert `post.workspaceId === job.data.workspaceId` in the worker as the first operation after fetching the post.

### RV-6: No systemic "forgotten route" defense
**Risk:** Any new route file added to `apps/api/src/routes/` has no automated enforcement of `assertWorkspaceAccess`. The existing tests only cover the 10 Phase 2 files.  
**Fix:** Add a Prisma client extension that requires explicit tenant scoping, or add a lint rule/pre-commit hook, or expand the static test to enumerate all route files.
