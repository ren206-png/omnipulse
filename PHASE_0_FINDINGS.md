# PHASE 0 FINDINGS — OmniPulse Codebase Discovery Audit

> Read-only audit. No functional code, migrations, or edits were made.
> Every claim includes a path:line citation. All citations were verified from disk.

---

## 1. Stack Verification

### Node Runtime & Module System
- **Node version**: `>=20` required (`package.json:11`)
- **pnpm version**: `>=9` required (`package.json:12`)
- **Module system**: ESM — `"type": "module"` is set in the API package (`apps/api/package.json:4`)
- **Monorepo manager**: pnpm workspaces (`pnpm-workspace.yaml`)

### API Framework
- **Express** `^4.19.2` (`apps/api/package.json:29`)
- Entry point: `apps/api/src/index.ts`
- Router files in `apps/api/src/routes/`

### ORM
- **Prisma** `^7.8.0` (both `prisma` dev dep and `@prisma/client` runtime dep — `apps/api/package.json:50-51`)
- **Major version**: 7 (v7 "Prisma Postgres" release line)
- **Schema file**: `apps/api/prisma/schema.prisma` (legacy `schema.prisma`, NOT a `prisma.config.ts`-only setup)
- **prisma.config.ts IS present**: `apps/api/prisma.config.ts:1-10` — it wraps `defineConfig` and points at `prisma/schema.prisma:5`. Both files coexist; schema.prisma is the canonical model definition.
- **Adapter**: `@prisma/adapter-pg` `^7.8.0` (`apps/api/package.json:17`)
- **Database**: PostgreSQL (`apps/api/prisma/schema.prisma:6`)
- **Migrations**: `apps/api/prisma/migrations/` (8 migration files as of audit)

### Queue System
- **BullMQ** `^5.78.0` (`apps/api/package.json:25`)
- **Redis client**: ioredis `^5.11.1` (`apps/api/package.json:33`)
- Queue defined in `apps/api/src/lib/queue.ts`
- Workers in `apps/api/src/workers/`

### Frontend Framework
- **Next.js** `^16.0.0` (`apps/web/package.json:14`)
- **React** `^19.0.0` (`apps/web/package.json:15`)
- App Router pattern — all pages under `apps/web/app/`

### UI Component Library
- **Radix UI primitives** (checkbox, dialog, label, popover, select, toast — `apps/web/package.json:13-18`)
- **class-variance-authority** `^0.7.0` (`apps/web/package.json:19`)
- **tailwind-merge** `^2.4.0` (`apps/web/package.json:26`)
- **lucide-react** `^0.414.0` (`apps/web/package.json:24`)
- This is a **shadcn/ui-style** setup: hand-rolled primitives in `apps/web/components/ui/` (button.tsx, card.tsx, checkbox.tsx, dialog.tsx, input.tsx, label.tsx, popover.tsx, select.tsx, textarea.tsx, toast.tsx)
- Note: no `shadcn/ui` package itself in package.json; the pattern is used but components were hand-authored.

### TypeScript Version
- **TypeScript** `^5.4.5` in both API and web packages (`apps/api/package.json:52`, `apps/web/package.json:35`)

---

## 2. Content Pipeline Map

### Draft Creation
- **Route handler**: `POST /api/v1/posts/draft` at `apps/api/src/routes/posts.ts:511`
- Creates a `ScheduledPost` with `status: 'DRAFT'` (`apps/api/src/routes/posts.ts:548`)
- `scheduledFor` defaults to 7 days from now if not supplied (`apps/api/src/routes/posts.ts:527`)
- No plan-limit is checked for drafts (comment at line 510: "no scheduling required, no plan-limit counted")

### Draft Save / Update
- **Route handler**: `PATCH /api/v1/posts/:id` at `apps/api/src/routes/posts.ts:913`
- Accepts `content`, `scheduledFor`, `platformVariants` in request body (`apps/api/src/routes/posts.ts:915`)
- Only `SCHEDULED` or `DRAFT` posts can be edited (`apps/api/src/routes/posts.ts:928`)
- **Frontend autosave**: `CreatePostForm.tsx` holds a `draftSaveTimerRef` and debounces saves (`apps/web/app/dashboard/calendar/CreatePostForm.tsx:324`). The autosave fires via `draftId` state changes (`apps/web/app/dashboard/calendar/CreatePostForm.tsx:975`).

### Post Scheduling
- **Route handler**: `POST /api/v1/posts/schedule` at `apps/api/src/routes/posts.ts:313`
- Body fields: `workspaceId`, `content`, `mediaUrls`, `platforms`, `scheduledFor`, `firstComment`, `platformVariants`, `recurrenceFreq`, `recurrenceEndsAt`, `campaignId` (`apps/api/src/routes/posts.ts:314`)
- Enqueues a BullMQ job to `publishPostQueue` with `{ delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` (`apps/api/src/routes/posts.ts:387-392`)
- Members get `status: 'PENDING_REVIEW'`; owners/admins get `status: 'SCHEDULED'` directly (`apps/api/src/routes/posts.ts:354`)
- Also: `POST /api/v1/posts/queue-schedule` at `apps/api/src/routes/posts.ts:407` — uses next open `QueueSlot` instead of explicit time.

### ScheduledPost Schema Model (all fields)
Source: `apps/api/prisma/schema.prisma:129-163`

```
model ScheduledPost {
  id                  String           @id @default(cuid())
  workspaceId         String
  workspace           Workspace        @relation(...)
  content             String
  mediaUrls           String[]
  platforms           Platform[]
  scheduledFor        DateTime
  status              PostStatus       @default(DRAFT)
  errorLog            String?
  responseLog         String?
  reviewNote          String?
  submittedBy         String?
  reviewedBy          String?
  createdAt           DateTime         @default(now())
  evergreen           Boolean          @default(false)
  evergreenInterval   Int?
  evergreenParentId   String?
  queuePosition       Int?
  utmSource           String?
  utmMedium           String?
  utmCampaign         String?
  firstComment        String?
  abVariantOf         String?
  abTestActive        Boolean          @default(false)
  recurrenceFreq      String?          // "daily"|"weekdays"|"weekly"|"monthly"
  recurrenceEndsAt    DateTime?
  recurrenceParentId  String?
  metrics             PostMetric[]
  platformVariants    PlatformVariant[]
  comments            PostComment[]
  campaignId          String?
  campaign            Campaign?        @relation(...)
}
```

**No SEO fields exist yet** on this model. There is no `seoTitle`, `seoDescription`, `altText`, or similar.

---

## 3. Media Pipeline Map

### Image Upload Route/Controller
- **Primary upload endpoint**: `POST /api/v1/media` at `apps/api/src/routes/media.ts:72`
  - Uses multer diskStorage to `public/uploads/` with UUID-named files (`apps/api/src/routes/media.ts:44-50`)
  - Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4` (`apps/api/src/routes/media.ts:57`)
  - 10 MB file size limit (`apps/api/src/routes/media.ts:53`)
  - Returns `{ asset }` with `url: ${env.API_URL}/uploads/${filename}` (`apps/api/src/routes/media.ts:88`)
- **Alias upload**: `POST /api/v1/media/upload` at `apps/api/src/routes/media.ts:101` (used by media library)
- **Library save**: `POST /api/v1/media/library` persists metadata to the `MediaAsset` Prisma model (`apps/api/src/routes/media.ts:133`)
- **Frontend**: `MediaLibraryModal` at `apps/web/app/dashboard/media/MediaLibraryModal.tsx`; imported in `CreatePostForm.tsx:12`

### MediaAsset Schema Model (all fields)
Source: `apps/api/prisma/schema.prisma:458-470`

```
model MediaAsset {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(...)
  url         String
  filename    String
  mimeType    String
  size        Int       @default(0)
  tags        String[]
  createdAt   DateTime  @default(now())
}
```

**No `altText` field exists** on `MediaAsset`. The only place `altText` appears in the codebase is as a parameter in `publishLinkedInImage()` (`apps/api/src/lib/linkedinPublisher.ts:96`), but it is NOT stored in any model.

### Per-Platform Payload Assembly
- Handled in the BullMQ worker at `apps/api/src/workers/publishPost.worker.ts:219-237`
- Builds `variantMap` from `post.platformVariants` array (`apps/api/src/workers/publishPost.worker.ts:218-221`)
- For each platform in `post.platforms`, selects `variant.content + hashtags` or falls back to `post.content` (`apps/api/src/workers/publishPost.worker.ts:234`)
- Media URLs: if variant has `mediaUrls`, use those; else fall back to `post.mediaUrls` (`apps/api/src/workers/publishPost.worker.ts:237`)
- LinkedIn has a dedicated dispatch path (`apps/api/src/workers/publishPost.worker.ts:239-344`)

### Existing Alt-Text Fields
- `MediaAsset` model: **no `altText` field** (`apps/api/prisma/schema.prisma:458-470`)
- `ScheduledPost` model: **no `altText` field** (`apps/api/prisma/schema.prisma:129-163`)
- `PlatformVariant` model: **no `altText` field** (`apps/api/prisma/schema.prisma:178-189`)
- Only occurrence: function parameter `altText: string` in `publishLinkedInImage()` at `apps/api/src/lib/linkedinPublisher.ts:96` — passed as the image caption to LinkedIn Posts API but not persisted.

---

## 4. Editor UI Map

### Post Editor Component (Main Canvas)
- **File**: `apps/web/app/dashboard/calendar/CreatePostForm.tsx`
- Exported as `CreatePostForm` function component (`apps/web/app/dashboard/calendar/CreatePostForm.tsx:302`)
- Props: `selectedDate`, `workspaceId`, `token`, `onSuccess`, `onClose`, `initialContent`, `initialPlatforms`, `initialMediaUrls`, `initialDraftId` (`apps/web/app/dashboard/calendar/CreatePostForm.tsx:212-222`)

### Scheduling Controls
- Time input (`type="time"`) at `apps/web/app/dashboard/calendar/CreatePostForm.tsx:2072`
- "Best time" quick-apply button at line `2078`
- "Best times" dropdown (shows heatmap per platform) at line `2093`
- `selectedDate` is set by the parent `CalendarClient` via date click
- Schedule time assembled at `apps/web/app/dashboard/calendar/CreatePostForm.tsx:1148-1150`
- Recurrence controls (frequency, ends-at) in the `advancedOpen` section, state at line `327`

### Side Panels / Drawers in the Editor
The editor does not use full drawers — it uses inline collapsible sections and overlays within the same form. Identified panels (all in `CreatePostForm.tsx`):

| Panel | Toggle state | Location |
|---|---|---|
| AI Generation Panel | `aiOpen` | line 1280 |
| AI Image Generation Panel | `imageGenOpen` | line 1409 |
| Content Score Panel | `scoreExpanded` | line 1625 |
| AI Coach Panel | `coachOpen` | line 1694 |
| Translate Panel | `translateOpen` | line 1748 |
| Live Preview Panel (desktop only) | always visible on lg | line 2431 |
| Template Picker | `templatesOpen` | line 1242 |
| Hook Library | `hookLibraryOpen` | line 1552 |
| Per-Platform Variant Tabs | `variantsOpen` | line 1612 |
| Best Times Dropdown | `bestTimesOpen` | line 2115 |
| SafeGuard Report | `safeGuardExpanded` | line 2322 |
| Advanced Options | `advancedOpen` | line 2172 |
| Media Library Modal | `showMediaLibrary` | separate modal component |

### Design-System Components Available
Directory: `apps/web/components/ui/`

| Component | File |
|---|---|
| Button | `apps/web/components/ui/button.tsx` |
| Card | `apps/web/components/ui/card.tsx` |
| Checkbox | `apps/web/components/ui/checkbox.tsx` |
| Dialog | `apps/web/components/ui/dialog.tsx` |
| Input | `apps/web/components/ui/input.tsx` |
| Label | `apps/web/components/ui/label.tsx` |
| Popover | `apps/web/components/ui/popover.tsx` |
| Select | `apps/web/components/ui/select.tsx` |
| Textarea | `apps/web/components/ui/textarea.tsx` |
| Toast | `apps/web/components/ui/toast.tsx` |

No `Drawer`, `Sheet`, `Tabs`, `Badge`, `Tooltip`, or `Slider` components exist yet in `components/ui/`. These would need to be added if the SEO panel needs them.

---

## 5. AI/LLM Integration Precedent

### AI Service Wrappers
- **Primary AI route**: `apps/api/src/routes/ai.ts` — all AI endpoints are Express routes directly instantiating `Anthropic` client (no shared singleton wrapper)
- **Content Multiplier**: `apps/api/src/lib/contentMultiplier.ts` — dedicated module that calls Anthropic SDK, validates JSON output, and has a 1-retry pattern
- **Visual Copywriter (caption from image)**: `apps/api/src/lib/visualCopywriter.ts`
- **SafeGuard (content safety scan)**: `apps/api/src/lib/safeguard.ts`
- Model used throughout: `claude-haiku-4-5-20251001` (`apps/api/src/routes/ai.ts:167`)

### API Keys / Env Var Handling
- `ANTHROPIC_API_KEY` stored in `.env` / `.env.example` (`apps/api/src/config/env.ts:28`)
- Accessed via `env.ANTHROPIC_API_KEY` (the typed env module at `apps/api/src/config/env.ts:28`)
- Route checks `if (!env.ANTHROPIC_API_KEY)` before any AI call and returns `503 AI_UNAVAILABLE` (`apps/api/src/routes/ai.ts:89`)
- Per-user daily caps: `AI_MULTIPLIER_DAILY_LIMIT` and `AI_VISION_DAILY_LIMIT` env vars, defaulting to `50` (`apps/api/src/config/env.ts:45-46`)
- Daily limits tracked in Redis with UTC midnight TTL (`apps/api/src/routes/ai.ts:25-50`)

### Existing Retry / Timeout Patterns
- **Link-preview fetch**: `AbortController` with 5-second `setTimeout` (`apps/api/src/routes/ai.ts:342-343`)
- **Content Multiplier**: one retry on JSON parse failure with reinforced schema instruction (`apps/api/src/lib/contentMultiplier.ts:126-134`)
- **BullMQ publish jobs**: `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` on all post schedule calls (`apps/api/src/routes/posts.ts:389-391`)
- **No SDK-level retry config** (no `maxRetries` passed to Anthropic client constructor — the SDK's own default retry behaviour applies)

### Logger Module
- **File**: `apps/api/src/lib/logger.ts`
- Uses **pino** `^9.5.0` with `pino-pretty` in non-production
- Log level from `process.env.LOG_LEVEL` defaulting to `'info'` (`apps/api/src/lib/logger.ts:3`)
- Exported as named `logger` (`apps/api/src/lib/logger.ts:3`)

---

## 6. Proposed Injection Points

The following is a forward-looking design recommendation based on the audit findings. No code is written here.

### The Four SEO Features (assumed from brief context)
1. **Per-post SEO metadata** (title, description, canonical URL)
2. **Image alt-text** per media attachment / platform variant
3. **Link preview / OG meta scraping** (already partially present)
4. **Keyword/hashtag SEO scoring**

---

### Feature 1 & 3 — PostSeoMetadata Sidecar Model

**New schema model to add** (new migration, additive only):

```prisma
model PostSeoMetadata {
  id            String        @id @default(cuid())
  postId        String        @unique
  post          ScheduledPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  workspaceId   String        // for tenant isolation queries
  seoTitle      String?
  seoDescription String?
  canonicalUrl  String?
  ogImageUrl    String?
  focusKeyword  String?
  keywordScore  Int?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([workspaceId])
}
```

**Injection points:**

| Location | What to hook |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `PostSeoMetadata` model and `seoMetadata PostSeoMetadata?` relation on `ScheduledPost` |
| `apps/api/src/routes/posts.ts:511` (POST /draft) | Optionally create stub `PostSeoMetadata` row on draft creation |
| `apps/api/src/routes/posts.ts:913` (PATCH /:id) | Accept `seoMetadata` in body and upsert `PostSeoMetadata` |
| `apps/api/src/routes/posts.ts:313` (POST /schedule) | Accept + persist `seoMetadata` |
| New file: `apps/api/src/routes/seo.ts` | CRUD endpoints: GET/POST/PATCH `/api/v1/seo/:postId` |

---

### Feature 2 — Alt-Text on Media

**Additive approach**: add `altText` to `PlatformVariant` (already the per-platform payload model) and optionally to `MediaAsset`.

**Schema change** (new migration, additive):

```prisma
// In PlatformVariant — add one nullable field
altText String?

// In MediaAsset — add one nullable field  
altText String?
```

**Injection points:**

| Location | What to hook |
|---|---|
| `apps/api/prisma/schema.prisma:178` (`PlatformVariant`) | Add `altText String?` |
| `apps/api/prisma/schema.prisma:458` (`MediaAsset`) | Add `altText String?` |
| `apps/api/src/routes/posts.ts:280` (`validateVariants`) | Accept `altText` in `PlatformVariantInput` |
| `apps/api/src/routes/posts.ts:370` (create variants) | Pass `altText` in createMany data |
| `apps/api/src/workers/publishPost.worker.ts:237` | Pass `variant.altText` into `publishLinkedInImage()` call (already accepts it at `linkedinPublisher.ts:96`) |
| `apps/api/src/routes/media.ts:133` (POST /library) | Accept `altText` in body and persist |
| Frontend: `apps/web/app/dashboard/calendar/CreatePostForm.tsx` | Add `altText` input to `PlatformVariantTabs` component (around line 120) |

---

### Feature 4 — Keyword / Hashtag SEO Scoring

**No new model needed** — store `keywordScore` and `focusKeyword` in `PostSeoMetadata` (above).

**New API endpoint**:

```
POST /api/v1/ai/seo-score
Body: { content, platforms, focusKeyword, workspaceId }
```

**Injection points:**

| Location | What to hook |
|---|---|
| New file: `apps/api/src/lib/seoScorer.ts` | Algorithmic scorer (no LLM needed for basic keyword density) or thin Anthropic call like `scorePost()` at `ai.ts:1114` |
| `apps/api/src/routes/ai.ts:1241` (after `/score` route) | Register new `router.post('/seo-score', ...)` |
| Frontend: `apps/web/app/dashboard/calendar/CreatePostForm.tsx` | New `SeoScoreWidget` component, modelled after `ContentScoreWidget` at line 245 |

---

### New Files to Create

```
apps/api/src/routes/seo.ts            — CRUD for PostSeoMetadata
apps/api/src/lib/seoScorer.ts         — keyword/SEO scoring logic
apps/web/app/dashboard/calendar/SeoPanel.tsx  — collapsible SEO panel inside editor
```

---

## 7. Risk Register

### R-1: Media route has a dual-store design
`POST /api/v1/media` stores to an in-memory JSON flat file (`_index.json`) while `POST /api/v1/media/library` stores to the Prisma `MediaAsset` table. These two stores are not in sync (`apps/api/src/routes/media.ts:19-38` vs `apps/api/src/routes/media.ts:133-146`). Any alt-text feature built on `MediaAsset` will not cover files uploaded via the legacy `/media` endpoint. **Additive constraint: hard** — the flat-file store cannot be removed without migrating existing upload references.

### R-2: No `altText` in any existing model
Because `altText` does not exist anywhere on `ScheduledPost`, `PlatformVariant`, or `MediaAsset`, adding it is fully additive. The risk is low. However, the `publishLinkedInImage` function already accepts `altText` as a parameter (`apps/api/src/lib/linkedinPublisher.ts:96`) but is called with a hardcoded snippet of post content (`apps/api/src/workers/publishPost.worker.ts:322`). The real alt-text needs to flow from the stored variant once the field is added.

### R-3: Tenant isolation on PostSeoMetadata
The `PostSeoMetadata` model must always be scoped by `workspaceId` in every query (not just `postId`). Without this, a crafted `postId` belonging to another workspace could leak SEO metadata. The `workspaceId` index on the proposed model supports this, but every API handler must perform a workspace ownership check before returning SEO data (same pattern used in `getWorkspaceRole()` at `apps/api/src/routes/posts.ts:21`).

### R-4: Prisma v7 + `(prisma.X as Function)` casts
Throughout `posts.ts`, calls are cast as `(prisma.scheduledPost.create as Function)` rather than using typed calls (`apps/api/src/routes/posts.ts:356`, `465`, etc.). This is a workaround for Prisma v7 type inference issues. New Prisma models (e.g. `PostSeoMetadata`) may need similar casts until the generated types stabilise.

### R-5: Editor has many inline panels — panel overflow risk
`CreatePostForm.tsx` already has 12 distinct collapsible panels (see Section 4). Adding a 13th SEO panel must be carefully placed to avoid visual/UX overload. The `advancedOpen` section (`apps/web/app/dashboard/calendar/CreatePostForm.tsx:2172`) is the least intrusive injection point.

### R-6: No timeout on Anthropic SDK calls (except link-preview)
The link-preview endpoint uses `AbortController` with a 5-second timeout (`apps/api/src/routes/ai.ts:343`). All direct `client.messages.create()` calls (hashtags, score-post, repurpose, coach, etc.) have **no timeout**. A new SEO scoring endpoint calling the LLM should implement the same `AbortController` pattern.

### R-7: Content Multiplier retry is parse-only
The one-retry in `contentMultiplier.ts:133` only catches JSON parse errors. Network errors or Anthropic 529 overload errors bubble up as unhandled rejections in the route handler. Any new AI feature should follow the same retry pattern and add a network-error catch branch.

### R-8: `threadSlides` field accessed but not in schema
In `publishPost.worker.ts:355`, `post.threadSlides` is referenced — `if (platform === 'X' && externalId && post.threadSlides)` — but `threadSlides` is not present in `apps/api/prisma/schema.prisma`. This is accessed via the untyped `post` object returned by a `findUnique as Function` cast, suggesting a migration for thread slides may have been written but not applied, or is a planned field. This is an existing inconsistency unrelated to SEO work.

---

## Adversarial Self-Check

Three claims were challenged by re-reading the cited files:

**Claim: "prisma.config.ts IS present"** — verified at `apps/api/prisma.config.ts:1-10`. File exists, imports `defineConfig` from `'prisma/config'`, sets `schema: 'prisma/schema.prisma'`. Claim confirmed.

**Claim: "No `altText` field exists on MediaAsset"** — re-read `apps/api/prisma/schema.prisma:458-470`. Fields are: `id`, `workspaceId`, `workspace`, `url`, `filename`, `mimeType`, `size`, `tags`, `createdAt`. No `altText`. Claim confirmed.

**Claim: "BullMQ job is enqueued with `attempts: 3` and exponential backoff"** — re-read `apps/api/src/routes/posts.ts:387-392`. The `publishPostQueue.add('publish-post', { postId: post.id }, { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } })` call is present. Claim confirmed.
