# Phase 3d — Prisma 7 Migration Plan

> **Status: PLAN ONLY — no changes executed**
> Authored: 2026-07-04

---

## 1. Current State

### Version
- `prisma`: `^7.8.0` (devDependency)
- `@prisma/client`: `^7.8.0` (dependency)
- `@prisma/adapter-pg`: `^7.8.0` (dependency)

### What is already done
- `@prisma/adapter-pg` is already listed in `apps/api/package.json` — the driver adapter dependency is present.
- `apps/api/package.json` has `"type": "module"` — the project is already running as ESM, which is required by Prisma 7's default client output.
- `prisma/schema.prisma` uses `provider = "prisma-client-js"` with no `output` or `previewFeatures` stanzas — there is no `driverAdapters` preview flag in the schema, which means the adapter wiring is **not yet activated** in the schema itself.
- No `prisma.config.ts` exists yet — the new Prisma 7 config file that enables the adapter at the CLI/generate level has not been created.

---

## 2. Outstanding Breaking Changes from Prisma 7

### 2a. Driver adapter not activated in schema
`schema.prisma` must opt into the driver adapter. Without this, `@prisma/adapter-pg` has no effect and Prisma still uses its own binary engine.

**File:** `apps/api/prisma/schema.prisma` (line 2)
Change required:
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]   // ADD THIS
}
```

### 2b. PrismaClient must be instantiated with the adapter
Wherever `PrismaClient` is constructed it must receive the pg adapter instance. Prisma 7 will throw at runtime if the schema declares `driverAdapters` but no adapter is passed.

**File:** `apps/api/src/lib/prisma.ts` (location TBD — read the file before editing)
Required change pattern:
```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool }      from 'pg'
import { PrismaClient } from '@prisma/client'

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
export const prisma = new PrismaClient({ adapter })
```

### 2c. `prisma.config.ts` (new in Prisma 7)
Prisma 7 introduces an optional `prisma.config.ts` at the repo root or `apps/api/` level that centralises schema path, migration engine, and adapter configuration. This file does not yet exist.

Recommended content for `apps/api/prisma.config.ts`:
```ts
import { defineConfig } from 'prisma/config'
import { PrismaPg }     from '@prisma/adapter-pg'
import { Pool }         from 'pg'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  migrate: {
    adapter: () => {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      return new PrismaPg(pool)
    },
  },
})
```

### 2d. `datasource db` — `url` field required
`apps/api/prisma/schema.prisma` line 6 currently has:
```prisma
datasource db {
  provider = "postgresql"
}
```
There is no `url` field. Prisma 7 requires `url` (or `directUrl`) to be set, even when a driver adapter is in use — typically via env var reference:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 2e. No deprecated API calls found
A codebase search found no usage of `findUnique` replaced by anything, no raw `$queryRaw` template literals that changed signature, and no `@prisma/client/runtime` direct imports. The existing Prisma calls (findMany, create, update, upsert, findFirst, delete) are all stable across Prisma 5 → 7.

---

## 3. Exact Steps to Complete the Migration

Execute in this order to keep the build green at each step:

**Step 1 — Update `schema.prisma` datasource + generator**
File: `apps/api/prisma/schema.prisma`
- Line 2: add `previewFeatures = ["driverAdapters"]` to the `generator client` block.
- Line 6–8: add `url = env("DATABASE_URL")` to the `datasource db` block.

**Step 2 — Create `prisma.config.ts`**
File: `apps/api/prisma.config.ts` (new file)
Content as shown in §2c above.

**Step 3 — Wire adapter in `prisma.ts`**
File: `apps/api/src/lib/prisma.ts`
Replace the bare `new PrismaClient()` with the adapter-aware constructor shown in §2b.

**Step 4 — Regenerate the client**
```bash
cd apps/api && npx prisma generate
```
Confirm no errors.

**Step 5 — Run migrations against dev DB**
```bash
cd apps/api && npx prisma migrate dev --name prisma7-driver-adapter
```
This is a no-op schema migration (no model changes) but re-runs engine selection.

**Step 6 — Build**
```bash
cd apps/api && npm run build
```
Must exit 0.

**Step 7 — Smoke test**
Start the API and hit `GET /health` — confirm Prisma connects without engine binary.

---

## 4. Blast Radius — What Needs Testing After Migration

Every route and worker that uses `prisma` must be regression-tested because the execution path changes from the binary query engine to the pg driver adapter.

### Workers
| File | Risk |
|------|------|
| `apps/api/src/workers/guardian.worker.ts` | Uses `detectAndFix` / `remindPendingReviews` — both hit Prisma |
| `apps/api/src/workers/analytics.worker.ts` | `prisma.socialAccount.findMany`, `prisma.analyticsSnapshot.create` |
| `apps/api/src/workers/analyticsSync.worker.ts` | Multiple `prisma.*` calls across all platforms |

### Routes (all use Prisma — full smoke test required)
- Auth routes (`/auth/*`) — `User` model reads/writes, password reset, 2FA
- Post routes (`/posts/*`) — `Post`, `SocialAccount` models
- Workspace routes (`/workspaces/*`) — `Workspace`, `WorkspaceMember`
- Analytics routes (`/analytics/*`) — `AnalyticsSnapshot`
- Notification routes — `Notification` model

### Migrations
- `npx prisma migrate deploy` in staging must complete without errors before production.

---

## 5. Go / No-Go Criteria

### Go
- [ ] `npx prisma generate` exits 0 with no warnings about missing adapter
- [ ] `npm run build` exits 0
- [ ] `GET /health` returns 200 and Prisma does not log binary-engine startup messages
- [ ] At least one read (`prisma.user.findFirst`) and one write (`prisma.analyticsSnapshot.create`) confirmed in integration test or manual smoke test against staging DB
- [ ] `npx prisma migrate deploy` runs cleanly against staging database
- [ ] No regression in auth flow (login, JWT, 2FA) in staging

### No-Go (block deployment if any of these)
- `prisma generate` errors referencing missing `driverAdapters` preview feature
- TypeScript build errors after adapter wiring
- DB connection errors at runtime (wrong Pool config, missing `DATABASE_URL`)
- Any existing migration fails during `migrate deploy` in staging
- Performance regression >20% on p95 latency for `/posts` or `/analytics` endpoints compared to pre-migration baseline
