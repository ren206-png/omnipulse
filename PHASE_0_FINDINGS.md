# Phase 0 Findings — Automation Engine Repository Analysis

Generated: 2026-09-01. All citations include file path and line number.

---

## 1. Package Manager, Node, TypeScript, Tests

| Item | Finding | Citation |
|---|---|---|
| Package manager | pnpm monorepo | root `package.json` l.15 |
| Node requirement | `>=20` | root `package.json` l.11 |
| TypeScript strict | `true` | `apps/api/tsconfig.json` l.8 |
| target / module | `ES2022` / `ESNext` / `bundler` | `apps/api/tsconfig.json` l.3-5 |
| Path aliases | **None configured** | `apps/api/tsconfig.json` |
| ESLint | **No ESLint config anywhere in monorepo** | entire monorepo |
| Test framework | Node built-in `node:test` (`npx tsx --test`) | `apps/api/src/routes/__tests__/auth.me.test.ts` l.1-9 |
| Testcontainers | **Not present** | all package.json files |
| Existing test files | `auth.me.test.ts`, `content-health.test.ts`, `tenantIsolation.test.ts` | `apps/api/src/routes/__tests__/` |

**Impact on deliverables:** "lint clean" means `tsc --noEmit` only. Tests use `npx tsx --test`. Docker Compose documented for integration tests (no Testcontainers).

---

## 2. Prisma

| Item | Finding | Citation |
|---|---|---|
| Prisma version | `^7.8.0` | `apps/api/package.json` l.19, l.54 |
| Generator | `prisma-client-js` | `schema.prisma` l.1-3 |
| Datasource | `postgresql` via `DATABASE_URL` env | `schema.prisma` l.5-7 |
| Migration state | 29 applied; latest `20260714000001_add_youtube_platform`; **no pending** | `apps/api/prisma/migrations/` |
| Auto-migrate on startup | `prisma migrate deploy` on startup | `apps/api/src/index.ts` l.84 |

---

## 3. BullMQ / Queue

| Item | Finding | Citation |
|---|---|---|
| BullMQ version | `^5.78.0` | `apps/api/package.json` l.27 |
| Deprecated `QueueScheduler` | **Not used** | all .ts files |
| Job Schedulers API | `upsertJobScheduler` used correctly | `apps/api/src/workers/guardian.worker.ts` l.23 |
| Redis connection factory | `apps/api/src/lib/queue.ts` — parses `REDIS_URL`, correct BullMQ settings | `queue.ts` l.4-18 |
| Existing queue names | `publish-post`, `analytics-sync`, `guardian`, `stuck-job-sweeper`, `engagement-alert`, `evergreen-recycler` | `queue.ts` l.21-22; worker files |
| Key prefix | **None set** on existing connection | `queue.ts` |

New automation queues will use a separate IORedis connection with `prefix: '{omnipulse:automation}'`.

---

## 4. Authentication and Tenant Context

| Item | Finding | Citation |
|---|---|---|
| Auth middleware | `requireAuth` — JWT from `Authorization: Bearer` or cookie | `apps/api/src/middleware/auth.ts` l.23-50 |
| JWT payload | `{ id, email, role, iat? }` → `req.user` | `auth.ts` l.34-50 |
| Tenant model | **Does not exist.** Platform is workspace-based: `User` → `Workspace` → `WorkspaceMember` | `schema.prisma` l.32, l.82 |
| Workspace access guard | `assertWorkspaceAccess(workspaceId, userId, minRole?)` | `apps/api/src/lib/tenantGuard.ts` l.29-61 |
| Role ranking | `OWNER:3 > ADMIN:2 > MEMBER:1 > CLIENT_APPROVER:0` | `tenantGuard.ts` l.24 |
| `/api/v1/auth/me` defect | **No active defect.** Prior C-3/RV-* vulnerabilities are patched | `tenantIsolation.test.ts` l.401 |

**Critical mapping:** Every "Tenant" / "tenantId" in the spec maps to **Workspace / workspaceId** in this codebase. All new Prisma fields named `tenantId` in the spec will be `workspaceId` with FK to `Workspace.id`.

---

## 5. Messaging Domain

| Component | Exists? | Detail | Citation |
|---|---|---|---|
| `Contact` model | **NO** | Not in schema | `schema.prisma` (all 644 lines) |
| `Conversation` / `Thread` model | **NO** | Not in schema | `schema.prisma` |
| Inbound message model | **Partial** — `InboxMessage` | `COMMENT\|MENTION\|DM`; no `contactId` FK; no threading | `schema.prisma` l.300-319 |
| Real inbound ingestion | **NO** | Inbox seed uses hardcoded mock data | `apps/api/src/routes/inbox.ts` l.12-22 |
| Channel adapters | **NO** | All publishing through Ayrshare SDK | `apps/api/src/integrations/ayrshare.ts` |
| Outbound send | Ayrshare `publishPost()` — feed posts only, not DMs | `ayrshare.ts` l.59-77 |
| Social platform webhook receivers | **NO** | `webhooks.ts` emits outbound to workspace endpoints | `apps/api/src/routes/webhooks.ts` |
| Ayrshare DM/messaging | **Not used** | `ayrshare.ts` |

---

## 6. Ayrshare Integration

| Item | Finding | Citation |
|---|---|---|
| npm package | `social-media-api: ^1.3.0` | `apps/api/package.json` l.41 |
| Integration file | `apps/api/src/integrations/ayrshare.ts` | — |
| APIs used | `social.post()`, `social.analyticsLinks()`, `social.setTwitterByo()` | `ayrshare.ts` l.56, 67, 84 |
| DM/messaging | **Not used** | `ayrshare.ts` |
| LINKEDIN gap | `LINKEDIN` missing from `PLATFORM_MAP` | `ayrshare.ts` l.29-36 |

---

## 7. Infrastructure

| Item | Finding | Citation |
|---|---|---|
| Logging | `pino ^9.5.0`; pretty in dev, JSON in prod | `apps/api/src/lib/logger.ts` |
| Metrics | **None** — no prom-client | all files |
| Health shallow | `GET /health` → 200 always | `apps/api/src/index.ts` l.101-108 |
| Health deep | `GET /api/v1/admin/health/deep` — DB, Redis, BullMQ | `apps/api/src/lib/healthProbes.ts` |
| Graceful shutdown | SIGTERM/SIGINT → `prisma.$disconnect()` only; **BullMQ workers NOT closed** | `apps/api/src/index.ts` l.207-219 |
| Error envelope | `sendError(res, code, code, message)` → `{ error, code, statusCode }` | `apps/api/src/lib/apiError.ts` l.9-17 |
| RBAC | `requireAuth` (JWT) + `assertWorkspaceAccess` | `auth.ts`, `tenantGuard.ts` |
| Feature flags | 6 env-var booleans prefixed `FF_*`; no runtime service | `apps/api/src/lib/featureFlags.ts` |

---

## 8. Working Tree Status

Branch `main`, up to date with `origin/main`. One unstaged auto-generated file (`apps/web/tsconfig.tsbuildinfo`) — irrelevant. **Working tree clean for all source files. Safe to proceed.**

---

## Blocking Findings

### B-1 — No Contact or Conversation model

The spec's additive columns target `Contact.*`. No `Contact` model exists.

**Proposed resolution:** Create two engine-owned models:

- **`AutomationContact`** — engine-owned contact identity. Fields: `id`, `workspaceId` (FK Workspace), `channel` (enum), `channelUserId` (opaque provider ID), `displayName?`, `automationOptedOut Boolean @default(false)`, `automationOptedOutAt?`, `automationFields Json?`, `firstSeenAt`, `lastSeenAt`. Unique `(workspaceId, channel, channelUserId)`.
- **`AutomationConversation`** — engine-owned thread. Fields: `id`, `workspaceId`, `contactId` (FK AutomationContact, cascade delete), `channel`, `providerConversationId?`, `startedAt`, `lastMessageAt`. Unique `(workspaceId, channel, providerConversationId)` (partial, where not null).

These are strictly engine-owned — not a general CRM. Not replacing or merging with `InboxMessage`.

**Awaiting confirmation.**

### B-2 — No inbound channel adapters or webhook receivers

No social platform sends inbound events to this app today.

**Proposed resolution:** Implement `ChannelAdapter` interface + `StubChannelAdapter` (tests) + `MetaChannelAdapter` skeleton (Instagram/Facebook Messenger — verifies `X-Hub-Signature-256`, normalizes to `NormalizedInboundEvent`; cannot go live without Meta app review but code is correct).

**Awaiting confirmation that this scope is acceptable, or name a different priority provider.**

### B-3 — No outbound DM send capability

Ayrshare `post()` is for feed posts, not DMs. No DM send path exists.

**Proposed resolution:** Outbox worker calls `ChannelAdapter.send(contact, message)`. Stub adapter marks `SENT` (test). Meta adapter calls Meta Send API directly using `SocialAccount.accessToken`. Automation outbound is independent of Ayrshare.

**Awaiting confirmation that calling Meta Send API directly is acceptable.**

---

## Assumptions (proceed on these if not corrected)

1. "Tenant" = "Workspace" — all `tenantId` fields → `workspaceId`; all Workspace column additions replace spec's Tenant additions.
2. `assertWorkspaceAccess` from existing `tenantGuard.ts` is the correct guard for all automation routes.
3. `AutomationContact` and `AutomationConversation` approved as engine-owned additive models.
4. `StubChannelAdapter` satisfies the E2E test. Meta adapter skeleton is correct code.
5. Meta Send API for outbound is acceptable.
6. "Lint clean" = `npx tsc --noEmit` zero errors (no ESLint).
7. Integration tests use `docker-compose up` prerequisite (no Testcontainers).
8. `prom-client` added as a new dependency for metrics.
9. `closeAutomationWorkers()` added to shutdown handler in `index.ts` (additive).
10. Automation queues use a new `IORedis` connection with `prefix: '{omnipulse:automation}'` (isolated from existing queues).
11. Global flag: `AUTOMATION_ENGINE_ENABLED` env var, default `false`. Per-workspace flag: `Workspace.automationEnabled Boolean @default(false)`.

---

## Implementation Plan — New and Modified Files Per Phase

### Phase 1 — Schema, migration, Zod schemas, validator, tests
- `apps/api/prisma/schema.prisma` *(modified — additive only)*
- `apps/api/prisma/migrations/20260901000001_automation_engine/migration.sql` *(new)*
- `apps/api/src/automation/types/zod.ts` *(new)*
- `apps/api/src/automation/types/index.ts` *(new — re-exports z.infer types)*
- `apps/api/src/automation/services/conditionEvaluator.ts` *(new)*
- `apps/api/src/automation/services/flowValidator.service.ts` *(new)*
- `apps/api/src/routes/__tests__/automation.validator.test.ts` *(new)*

### Phase 2 — Ingestion, idempotency, guards, trigger matching, tests
- `apps/api/src/automation/lib/automationQueue.ts` *(new)*
- `apps/api/src/automation/lib/automationCache.repository.ts` *(new)*
- `apps/api/src/automation/repositories/workspace.automation.repository.ts` *(new — tenant-scoped DB helpers)*
- `apps/api/src/automation/adapters/channelAdapter.interface.ts` *(new)*
- `apps/api/src/automation/adapters/stub.adapter.ts` *(new)*
- `apps/api/src/automation/adapters/meta.adapter.ts` *(new — skeleton)*
- `apps/api/src/automation/services/automationTrigger.service.ts` *(new)*
- `apps/api/src/automation/workers/automationTrigger.worker.ts` *(new)*
- `apps/api/src/routes/__tests__/automation.trigger.test.ts` *(new)*

### Phase 3 — Execution engine, locks, transactions, wait/resume, continuation, tests
- `apps/api/src/automation/lib/distributedLock.ts` *(new)*
- `apps/api/src/automation/services/flowExecution.service.ts` *(new)*
- `apps/api/src/automation/workers/flowExecution.worker.ts` *(new)*
- `apps/api/src/automation/workers/scheduledResume.worker.ts` *(new)*
- `apps/api/src/routes/__tests__/automation.execution.test.ts` *(new)*

### Phase 4 — Outbox, send integration, window policy, tests
- `apps/api/src/automation/workers/outbox.worker.ts` *(new)*
- `apps/api/src/routes/__tests__/automation.outbox.test.ts` *(new)*

### Phase 5 — REST routes, RBAC, webhook verification, flags, tests
- `apps/api/src/routes/automations.ts` *(new)*
- `apps/api/src/automation/lib/featureFlag.ts` *(new)*
- `apps/api/src/index.ts` *(modified — additive: register router + closeAutomationWorkers in shutdown)*
- `apps/api/src/routes/__tests__/automation.api.test.ts` *(new)*

### Phase 6 — Compile, lint, full test, E2E, adversarial check, handoff
- `apps/api/src/automation/e2e/run-e2e.ts` *(new)*
- `.env.example` *(modified — additive)*

---

`AWAITING: APPROVED: PHASE 0`
