# OmniPulse Phase 0 Security & Architecture Audit

**Auditor:** Claude (read-only, no files modified)  
**Date:** 2026-07-12  
**Scope:** `/Users/rennerkargbo/Desktop/omnipulse`  
**Methodology:** Static analysis only. Every claim is file:line-anchored. Claims not directly verified by code reading are marked `UNVERIFIED`.

---

## 1. AUTH AUDIT — `/api/me` Bug Analysis

### 1.1 The `/me` Endpoint

**File:** `apps/api/src/routes/auth.ts:255–270`

```typescript
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id, email, role, createdAt },
  })
  ...
  res.json({ user })
})
```

The endpoint exclusively uses `req.user!.id` (set by the JWT middleware) as the lookup key. It takes **no user/tenant identifier from request body, params, or query string**. The query is `where: { id: req.user!.id }`.

### 1.2 `requireAuth` Middleware

**File:** `apps/api/src/middleware/auth.ts:21–38`

- Extracts the token from `Authorization: Bearer <token>` header, or falls back to `req.cookies.token`.
- Calls `jwt.verify(token, env.JWT_SECRET)` — stdlib JWT verification.
- On success, sets `req.user = payload` where `payload` is `{ id, email, role }` from the JWT.
- The middleware does **not** query the database. Identity comes entirely from the JWT payload.

**Implication:** If `JWT_SECRET` is compromised or weak, attackers can forge any identity. The `/me` endpoint has no secondary DB validation of the session (no server-side session store, no `jti`/revocation check). A token issued before a password reset/change remains valid until expiry. `UNVERIFIED` — whether the JWT expiry window is short enough to limit this risk depends on the runtime value of `JWT_EXPIRES_IN`, which is not hardcoded.

### 1.3 Prisma Client Instantiation

**File:** `apps/api/src/lib/prisma.ts:1–14`

- Uses `@prisma/adapter-pg` with a `pg.Pool`. A single global `PrismaClient` is instantiated via `globalForPrisma` singleton pattern.
- No Row-Level Security (RLS) context is injected; all queries run with the same DB credentials. `UNVERIFIED` — whether the DB user has minimal privileges (SELECT-only on some tables, etc.) cannot be determined from application code alone.

### 1.4 Cross-Tenant Data Leak — CRITICAL QUESTION

**ANSWER: NO — the `/me` endpoint itself cannot return another tenant's data.**

**Evidence:**
- `auth.ts:255` — `/me` uses only `req.user!.id` (from JWT) for the DB lookup.
- `middleware/auth.ts:31` — `req.user` is set exclusively from the verified JWT payload; no request input can override it.
- The `select` clause (`auth.ts:258–260`) returns `id, email, role, createdAt` — all belonging to the authenticated user.

However, a **weaker form of cross-tenant risk exists in other routes** (detailed in Section 4 — specifically `content-health`).

### 1.5 Session Creation → Middleware → /me Trace

1. `POST /auth/register` or `POST /auth/login` issues a JWT containing `{ id, email, role }` (`auth.ts:66–71`, `117–121`).
2. Subsequent request to `GET /auth/me` passes the JWT in the `Authorization` header.
3. `requireAuth` verifies the JWT and sets `req.user = { id, email, role }` (`middleware/auth.ts:31–32`).
4. `/me` handler queries `prisma.user.findUnique({ where: { id: req.user.id } })` — no tenant resolution occurs; the user record does not contain workspaceId. Tenant (workspace) context is a separate concept resolved per-route via workspaceId query params.

---

## 2. DEPENDENCY RISK INVENTORY

### 2.1 Next.js

**Declared:** `apps/web/package.json:27` — `"next": "^16.0.0"`  
**Installed (pnpm-lock.yaml):** `next@16.2.9`

**CVE-2025-29927 Assessment:** NOT VULNERABLE.  
CVE-2025-29927 affects Next.js `< 15.2.3` (15.x branch) and `< 14.2.25` (14.x branch). The installed version is `16.2.9`, which is a later major version. The vulnerability involves middleware bypass via the `x-middleware-subrequest` header. Version 16.x is not in the affected range per the CVE advisory.

`UNVERIFIED` — this assessment is based on the publicly documented affected range. An independent CVE advisory lookup was not performed during this audit.

### 2.2 Prisma

**Declared:** `apps/api/package.json:52,18` — `"prisma": "^7.8.0"`, `"@prisma/client": "^7.8.0"`  
**Installed (pnpm-lock.yaml):** `prisma@7.8.0`, `@prisma/client@7.8.0`

**Prisma API Call Patterns Found Across Codebase:**

| Pattern | Representative Locations |
|---------|--------------------------|
| `findUnique` | `auth.ts:49,94,151,197,234,257`; `posts.ts:748,810,927,1015,1064,1098`; `webhooks.ts:19,87,117,137`; many more |
| `findMany` | `analytics.ts:42,85,129,187,321`; `posts.ts:44,67,135,186,203,249,447`; `analytics.worker.ts:20` |
| `findFirst` | `socialAccounts.ts:327,364,448`; `reports.ts:28,75,118`; `inbox.ts:40,92` |
| `create` | `auth.ts:56,172`; `posts.ts:358,468,545`; `socialAccounts.ts:341,371`; `webhooks.ts:59` |
| `update` | `auth.ts:207,241`; `posts.ts:759,826,883,972,1033,1071,1104`; `socialAccounts.ts:329,366,522,567` |
| `upsert` | `posts.ts:1071` (via cast) |
| `delete` | `posts.ts:1000`; `socialAccounts.ts:482`; `webhooks.ts:125` |
| `deleteMany` | `posts.ts:957`; `notifications.ts:67` |
| `createMany` | `posts.ts:959`; `inbox.ts:142` |
| `count` | `posts.ts:143,601`; `admin.ts:35–39`; `notifications.ts:24` |
| `$transaction` | `posts.ts:641` — used for bulk-schedule |
| `groupBy` | `admin.ts:39` |
| `$queryRaw` | **NOT FOUND** — no raw SQL queries detected |
| `$executeRaw` | **NOT FOUND** — no raw SQL queries detected |

**No raw SQL injection surface identified.**

### 2.3 BullMQ

**Declared:** `apps/api/package.json:29` — `"bullmq": "^5.78.0"`  
**Installed (pnpm-lock.yaml):** `bullmq@5.79.1`

**Pattern Search Results:**

| Pattern | Found | Location |
|---------|-------|----------|
| `repeat:` | NOT FOUND | — |
| `addBulk` | NOT FOUND | — |
| `RepeatableJob` | NOT FOUND | — |
| `getRepeatableJobs` | NOT FOUND | — |
| `upsertJobScheduler` | FOUND | `analytics.worker.ts:9` — uses cron pattern `'0 0 * * *'` |
| `attempts: 3` | FOUND | `publishPost.worker.ts:485`; `posts.ts:391,486,835,1041` |
| `backoff: exponential` | FOUND | Same locations as above |

**BullMQ retry behavior:** Jobs use `attempts: 3, backoff: { type: 'exponential', delay: 5000 }`. No `repeat:` or `addBulk` patterns; recurring posts are handled by spawning new DB records + new BullMQ jobs at publish time (`publishPost.worker.ts:443–492`).

### 2.4 Ayrshare / social-media-api

**File:** `apps/api/package.json:39` — `"social-media-api": "^1.3.0"` (NOT the package name `ayrshare`)  
**Import pattern:** `apps/api/src/integrations/ayrshare.ts:46` — uses `require('social-media-api')`; no `require('ayrshare')` or `from 'ayrshare'` found anywhere.

The package name in the codebase is `social-media-api`, which is the npm package name for the Ayrshare SDK. The service is wrapped in `AyrshareService`.

**Actual usage of AyrshareService:** Only in `analytics.worker.ts:4,24` for analytics data (`getAnalytics`). **The publish pipeline (`publishPost.worker.ts`) does NOT use AyrshareService.** It publishes directly to platform APIs (Twitter API v2, Facebook Graph API, Instagram Graph API, LinkedIn API) via native `fetch()` calls.

---

## 3. PUBLISH PIPELINE MAP

### 3.1 Worker Files

| File | Queue | Purpose |
|------|-------|---------|
| `workers/publishPost.worker.ts` | `publish-post` | Main post publishing to platform APIs |
| `workers/analytics.worker.ts` | `analytics-sync` | Daily analytics sync via Ayrshare SDK |
| `workers/analyticsSync.worker.ts` | helper function | Per-workspace analytics sync helper |
| `workers/engagementAlert.worker.ts` | `engagement-alerts` | 2-hour post-publish engagement check |
| `workers/evergreen.worker.ts` | (not audited in detail) | Evergreen content recycling |
| `workers/guardian.worker.ts` | (not audited in detail) | Content guardian/safeguard |

### 3.2 Publish Pipeline Trace

**Job Creation:**  
`POST /api/v1/posts/schedule` → `posts.ts:388–395` — calls `publishPostQueue.add('publish-post', { postId }, { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } })`

**Worker Processing** (`publishPost.worker.ts:185–522`):
1. Fetch `ScheduledPost` by `postId` from DB (`publishPost.worker.ts:190–196`)
2. Fetch `SocialAccount` records filtered by `workspaceId` and `platform` (`publishPost.worker.ts:199–213`)
3. For each platform, dispatch to direct platform API:
   - **X (Twitter):** `fetch('https://api.twitter.com/2/tweets', ...)` with Bearer token (`publishPost.worker.ts:85–93`)
   - **Facebook:** `fetch('https://graph.facebook.com/me/feed', ...)` (`publishPost.worker.ts:96–105`)
   - **Instagram:** Two-step container/publish flow (`publishPost.worker.ts:107–141`)
   - **LinkedIn:** `publishLinkedInText/Image/Video()` with token decryption + rate-limit guard (`publishPost.worker.ts:239–344`)
   - **TikTok/Google:** Returns `${platform}_manual_required` — **not actually published** (`publishPost.worker.ts:143–145`)
4. On success: updates DB status to `PUBLISHED`, emits webhook, schedules engagement check, spawns next recurrence (`publishPost.worker.ts:396–503`).
5. On total failure: updates DB status to `FAILED`, notifies user, **throws error** (causes BullMQ to retry) (`publishPost.worker.ts:504–519`).

**Ayrshare (social-media-api) is NOT used in the publish pipeline.** It is only called by `analytics.worker.ts` for metrics collection.

### 3.3 Retry Behavior

- **Automatic retries:** 3 attempts, exponential backoff starting at 5 seconds (`publishPost.worker.ts:485`; `posts.ts:391`).
- **LinkedIn rate limit:** Rescheduled to the next day via DB update (`publishPost.worker.ts:287–303`); does not consume a BullMQ retry attempt.
- **4xx errors:** Platform API 4xx errors cause the platform entry to be added to the `errors` map. If all platforms fail, the job throws, consuming a BullMQ retry attempt.
- **5xx / timeout:** Same path — error caught, added to errors map, job throws on total failure.
- **Stuck job detection:** No application-level stuck-job detection found. No `AbortSignal.timeout()` on direct platform `fetch()` calls (`publishPost.worker.ts:85,97,111`). `UNVERIFIED` — whether BullMQ queue-level `stalledInterval` is configured was not confirmed (queue config in `lib/queue.ts` was not read in full).
- **Failure notifications:** In-app `notify()` call on `POST_FAILED` (`publishPost.worker.ts:507–514`). No email or external alerting on exhausted retries.

### 3.4 Ayrshare API Key Scope

**File:** `apps/api/src/integrations/ayrshare.ts:41` — `process.env.AYRSHARE_API_KEY` (single global env var)  
**File:** `apps/api/src/config/env.ts:36` — `AYRSHARE_API_KEY: process.env.AYRSHARE_API_KEY`  
**File:** `.env.example:5` — `AYRSHARE_API_KEY=replace_with_ayrshare_key`

**The Ayrshare API key is stored as a single global environment variable, shared across all tenants.** There is no per-tenant Ayrshare `profileKey` used in the analytics sync. The `getAnalytics()` call uses `account.externalProfileId` as the `profileKey`.

---

## 4. TENANT ISOLATION AUDIT

### 4.1 General Pattern (Correct Implementation)

Most route files follow a consistent, safe pattern:
1. Extract `workspaceId` from `req.query` or `req.body`
2. Call `getWorkspaceRole(workspaceId, req.user!.id)` which queries `prisma.workspace.findUnique` + `prisma.workspaceMember.findUnique`
3. Reject with 403 if user has no membership

This pattern is correctly implemented in: `posts.ts` (most routes), `analytics.ts`, `socialAccounts.ts`, `webhooks.ts`, `campaigns.ts`, `apikeys.ts`, `queueSlots.ts`, `competitors.ts`, `seoData.ts`, `reports.ts`, `inbox.ts`.

### 4.2 CRITICAL: `content-health` Missing Workspace Authorization

**File:** `apps/api/src/routes/posts.ts:691–742`

```typescript
router.get('/content-health', async (req, res) => {
  const { workspaceId } = req.query          // ← comes from user input
  if (!workspaceId) { sendError(...); return }

  // NO getWorkspaceRole() call — no membership check
  const posts = await prisma.scheduledPost.findMany({
    where: { workspaceId, status: 'PUBLISHED', createdAt: { gte: since } },
    include: { metrics: true },
  })
  res.json({ posts: enriched })  // returns content + engagement metrics
})
```

**This endpoint performs no workspace membership check.** Any authenticated user can pass any `workspaceId` in the query string and receive that workspace's published posts (full content text), platforms, and engagement metrics for the last 90 days. This is a direct cross-tenant data leak.

- `router.use(requireAuth)` at `posts.ts:18` means the user must be authenticated.
- But there is no call to `getWorkspaceRole()` or any ownership/membership validation.
- The `workspaceId` comes directly from `req.query` without cross-checking against `req.user!.id`.

**Severity: CRITICAL — direct cross-tenant data leakage via user-controlled input.**

### 4.3 Workspace Isolation in `/:id` Post Routes

Routes operating on `postId` (not `workspaceId`):
- First fetch the post: `prisma.scheduledPost.findUnique({ where: { id } })` — gets `post.workspaceId`
- Then verify: `getWorkspaceRole(post.workspaceId, req.user!.id)` (`posts.ts:751,813,875,931,1018,1067,1101`)

This pattern correctly derives workspace from the resource rather than user input. **Safe.**

Comments endpoints (`posts.ts:1282–1315`) use an equivalent check (owner OR member lookup). **Safe.**

### 4.4 Analytics Sync Worker — No Workspace Scoping

**File:** `apps/api/src/workers/analytics.worker.ts:20`

```typescript
const accounts = await prisma.socialAccount.findMany()  // NO where clause
```

This fetches **all social accounts across all tenants** for the daily analytics sync. This is not a direct API-consumer data leak (server-side only), but it means the single shared `AYRSHARE_API_KEY` processes analytics for all tenants without isolation.

### 4.5 No `$queryRaw` or `$executeRaw` Found

Searched all files under `apps/api/src/`. Zero occurrences of either pattern. **No raw SQL injection surface.**

### 4.6 OAuth Callback Workspace Validation

**File:** `apps/api/src/routes/socialAccounts.ts:52–385`

The `/oauth/callback` endpoint extracts `workspaceId` from the `state` parameter (base64-encoded JSON set during the authenticated `/oauth/connect` call). The `userId` is embedded in state at connect time (`socialAccounts.ts:26`: `statePayload = { platform, workspaceId, userId: req.user!.id, pkceVerifier }`) but is **not re-validated against the authenticated session** on callback — the callback endpoint does not call `requireAuth` (`socialAccounts.ts:52`). However, since state is set server-side from an authenticated session and forging it would require knowledge of the PKCE verifier, the risk is bounded. `UNVERIFIED` — a full CSRF analysis would require reviewing state binding more carefully.

---

## 5. SECRETS & WEBHOOK SURFACE

### 5.1 AYRSHARE_API_KEY Storage

**Location:** Global environment variable only.  
**Files:** `apps/api/src/integrations/ayrshare.ts:41`, `apps/api/src/config/env.ts:36`, `.env.example:5`

The key is **not stored per-tenant in the database**. It is a single global secret shared across all tenants. All tenant analytics sync operations use this one key.

**Risk:** If Ayrshare's access control does not strictly scope `profileKey` access to the account that owns them, cross-tenant analytics data could be accessible. `UNVERIFIED` — dependent on Ayrshare's access model.

### 5.2 Outgoing Webhook Signatures (OmniPulse → Customer Endpoints)

**File:** `apps/api/src/lib/webhookEmitter.ts:11`

```typescript
const sig = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex')
// Header: 'X-OmniPulse-Signature': `sha256=${sig}`
```

Outgoing webhooks are HMAC-SHA256 signed. Secrets are generated with `crypto.randomBytes(32).toString('hex')` (`webhooks.ts:58`). Secrets are masked in list responses (`webhooks.ts:28–30`). **Properly implemented.**

### 5.3 Incoming Webhook Signature Verification (External → OmniPulse)

**Stripe:** `apps/api/src/routes/billing.ts:151–160` — `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`. **Properly verified.**

**No other incoming webhook receivers found.** There are no Ayrshare, Facebook, or other platform incoming webhook endpoints in the registered route list (`index.ts:109–142`).

### 5.4 OAuth Token Encryption

**File:** `apps/api/src/lib/tokenEncryption.ts`

- AES-256-GCM encryption with `TOKEN_ENCRYPTION_KEY` (64-char hex = 32 bytes).
- If `TOKEN_ENCRYPTION_KEY` is missing or wrong length, tokens are **stored as plaintext** (`tokenEncryption.ts:26`: `if (!key) return plain`).
- In production, `config/env.ts:14–22` logs a `console.error` if the key is absent/wrong, but does not abort startup — the API continues running with unencrypted tokens.

**LinkedIn tokens:** Encrypted at `socialAccounts.ts:293–294`. ✓  
**Facebook/Instagram/X/TikTok/Google tokens:** The OAuth callback saves `accessToken` directly (`socialAccounts.ts:366–374`) without calling `encryptToken()`. ✗

**Severity: HIGH — OAuth tokens for Facebook, Instagram, X, TikTok, Google are stored without encryption in the DB.** `UNVERIFIED` — whether `TOKEN_ENCRYPTION_KEY` is set in production is a runtime question.

### 5.5 JWT Configuration

- Algorithm: `UNVERIFIED` — the `algorithm` option is not explicitly set in any `jwt.sign()` call (`auth.ts:66–70`, `117–121`); defaults to HS256 per `jsonwebtoken` library behavior.
- Secret: `JWT_SECRET` from env, required at startup (`config/env.ts:3–8`). If the secret is short or guessable, tokens can be forged.
- No JWT revocation mechanism: no server-side session store, no `jti` blacklist. Password reset (`auth.ts:241`) clears `passwordHash` but does not invalidate existing tokens.
- 2FA intermediate token: 5-minute expiry, `twoFactor: true` claim (`auth.ts:108–113`). Properly distinguished from full session tokens at `auth.ts:146`.

---

## 6. RISK REGISTER — Top 10

| Rank | Severity | Title | File:Line | Description |
|------|----------|-------|-----------|-------------|
| 1 | **CRITICAL** | Cross-tenant data leak via `content-health` | `posts.ts:691–742` | Any authenticated user can query any workspace's published posts (full text), platforms, and engagement metrics for the last 90 days by supplying an arbitrary `workspaceId`. No workspace membership check is performed. Directly exploitable. |
| 2 | **HIGH** | OAuth tokens stored without encryption for non-LinkedIn platforms | `socialAccounts.ts:366–374` | Facebook, Instagram, X, TikTok, Google OAuth access tokens are saved to the database without calling `encryptToken()`. Only LinkedIn tokens are encrypted (`socialAccounts.ts:293`). DB compromise exposes all social account tokens. |
| 3 | **HIGH** | No JWT revocation / session invalidation | `middleware/auth.ts:31–32`; `auth.ts:241` | Tokens remain valid until expiry. Password reset does not invalidate existing JWTs. Account takeover cannot be mitigated by password change alone. |
| 4 | **HIGH** | `TOKEN_ENCRYPTION_KEY` absent causes silent plaintext fallback | `tokenEncryption.ts:26`; `config/env.ts:14–22` | If `TOKEN_ENCRYPTION_KEY` is missing or wrong length, `encryptToken()` silently returns plaintext. Only a `console.error` is emitted; the API continues. Even the LinkedIn path degrades silently. |
| 5 | **MEDIUM** | Analytics sync processes all tenants with a single shared Ayrshare key | `analytics.worker.ts:20`; `ayrshare.ts:41` | `prisma.socialAccount.findMany()` with no `where` clause processes every tenant's social accounts via one global API key. No per-tenant access isolation. |
| 6 | **MEDIUM** | No `AbortSignal.timeout()` on direct platform API `fetch()` calls | `publishPost.worker.ts:85,97,111` | Platform API calls have no timeout. A hung `fetch()` can stall BullMQ workers indefinitely. (Outgoing webhook emitter correctly uses `AbortSignal.timeout(5000)` at `webhookEmitter.ts:15`.) `UNVERIFIED` — BullMQ stalled-job interval may provide a backstop. |
| 7 | **MEDIUM** | AYRSHARE_API_KEY is global; no per-tenant isolation | `ayrshare.ts:41`; `.env.example:5` | Single API key for all tenants. If Ayrshare's `profileKey` scoping is bypassed or misconfigured, cross-tenant analytics data leakage is possible. `UNVERIFIED` — depends on Ayrshare's API enforcement. |
| 8 | **MEDIUM** | `POST /social-accounts` allows manual token injection without encryption | `socialAccounts.ts:413–471`; `socialAccounts.ts:456–464` | The authenticated direct-connect endpoint accepts `accessToken` in the request body and stores it as-is (`socialAccounts.ts:456–464`) without calling `encryptToken()`. |
| 9 | **LOW** | `prisma.scheduledPost.findUnique as Function` type-cast in worker | `publishPost.worker.ts:190,466` | Type-cast via `as Function` bypasses TypeScript's Prisma type checking. May indicate schema drift between Prisma schema and generated client. `UNVERIFIED` — runtime behavior depends on actual schema. |
| 10 | **LOW** | TikTok and Google posts silently succeed without publishing | `publishPost.worker.ts:143–145` | Platforms TIKTOK and GOOGLE return `${platform}_manual_required` as the external ID. These platform entries end up in `responseLog`, causing the post status to be set to `PUBLISHED` even though no actual publication occurred. |

---

## 7. ADVERSARIAL SELF-CHECK

Re-read of findings to flag any inference not directly verified:

1. **Section 1.2 — "JWT algorithm defaults to HS256":** The `algorithm` field is never explicitly set in any `jwt.sign()` call. This is the `jsonwebtoken` library default, but is `UNVERIFIED` by code inspection. Marked as such above.

2. **Section 1.2 — "Password reset does not invalidate JWTs":** Directly verified. `auth.ts:241` updates `passwordHash, passwordResetToken: null, passwordResetExpires: null` — no JWT revocation step. **Verified.**

3. **Section 2.1 — "Next.js 16.x not in CVE-2025-29927 range":** Knowledge-based inference. Not verified by reading an external CVE advisory. Marked `UNVERIFIED`.

4. **Section 3.3 — "BullMQ default stalled-job interval may provide a backstop":** `lib/queue.ts` was not read. Queue configuration options are unknown. Marked `UNVERIFIED`.

5. **Section 4.2 — "Any authenticated user can leak workspace posts":** Directly verified. `posts.ts:691–742` registers the `content-health` handler after `router.use(requireAuth)` at line 18, but before any `getWorkspaceRole()` call. The `workspaceId` used in the Prisma query is `req.query.workspaceId`. **Verified — CRITICAL.**

6. **Section 5.4 — "Non-LinkedIn tokens stored without encryption":** Directly verified. `socialAccounts.ts:293` calls `encryptToken(rawAccessToken)` only in the LinkedIn branch. The code at `socialAccounts.ts:366–374` (the fallthrough path for FB/X/TikTok/Google) writes `accessToken` directly to `data: { workspaceId, platform, accessToken, externalProfileId }`. `encryptToken` is imported at line 8 but not called. **Verified.**

7. **Section 6, Risk #10 — "TikTok/Google silently succeed without publishing":** Directly verified. `publishPost.worker.ts:143–145` returns `${platform}_manual_required`. The `responseLog[platform]` entry will be set to this string. The check at `publishPost.worker.ts:395–396` uses `Object.keys(responseLog).length === 0` to determine `allFailed`. Since `responseLog` has an entry (even a fake one), the post is marked `PUBLISHED`. The check at `publishPost.worker.ts:408–420` skips `postFirstComment` for entries containing `_manual_required`, but the status update still reads `PUBLISHED`. **Verified.**

8. **Section 4.6 — "OAuth callback CSRF risk bounded":** Partially inferred. The absence of `requireAuth` on the callback (`socialAccounts.ts:52`) is verified. The PKCE verifier binding claim is `UNVERIFIED` as a complete security guarantee without a full CSRF threat model analysis.

---

## Summary

| Critical Question | Answer | Evidence |
|-------------------|--------|----------|
| Can `/me` return another tenant's data? | **NO** | `auth.ts:257` uses only `req.user!.id`; middleware sets this from JWT only |
| Is there any cross-tenant data leak? | **YES** | `posts.ts:691–742` `content-health` endpoint — no workspace auth check |
| Any raw SQL? | **NO** | Zero `$queryRaw`/`$executeRaw` found |
| Next.js CVE-2025-29927 affected? | **NO** (UNVERIFIED) | `next@16.2.9` is outside reported affected range |
| Are OAuth tokens encrypted at rest? | **Partial** | LinkedIn only; FB/X/TikTok/Google stored plaintext |
| Incoming webhooks verified? | **Yes (Stripe only)** | `billing.ts:156` — Stripe signature check; no other incoming webhooks |
