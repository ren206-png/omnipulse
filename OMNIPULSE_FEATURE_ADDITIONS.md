# OmniPulse Feature Additions

Three features added on top of the existing codebase without modifying or removing any existing functionality.

---

## New Files Created

| Path | Purpose |
|---|---|
| `apps/api/src/routes/queueSlots.ts` | CRUD API for recurring posting time slots |
| `apps/api/src/lib/queueScheduler.ts` | Pure utility: `getNextAvailableSlot()`, timezone math via Intl API |
| `apps/web/app/dashboard/queue/QueueSlotsManager.tsx` | UI for managing recurring queue slots |
| `apps/api/prisma/migrations/20260629000001_add_platform_variants_to_scheduled_posts/migration.sql` | Creates `PlatformVariant` table |
| `apps/api/prisma/migrations/20260629000002_create_queue_slots/migration.sql` | Creates `QueueSlot` table |

---

## Existing Files Modified

| Path | What was added (not changed) |
|---|---|
| `apps/api/prisma/schema.prisma` | `PlatformVariant` model; `QueueSlot` model; `Workspace.queueSlots[]` relation; `ScheduledPost.platformVariants[]` relation |
| `apps/api/src/routes/posts.ts` | `validateVariants()` helper; `platformVariants` support in `POST /schedule` and `PATCH /:id`; `include: { platformVariants }` in GET responses; new `GET /calendar` endpoint; new `POST /queue-schedule` endpoint; import of `getNextAvailableSlot` |
| `apps/api/src/workers/publishPost.worker.ts` | Loads `platformVariants` alongside post; per-platform dispatch uses variant content (with hashtag appending for Instagram); falls back to master content |
| `apps/api/src/index.ts` | Registered `queueSlotsRouter` at `/api/v1/queue-slots` |
| `apps/web/app/dashboard/queue/page.tsx` | Added `QueueSlotsManager` section above existing queued posts list |
| `apps/web/app/dashboard/calendar/CreatePostForm.tsx` | `PlatformVariantTabs` component; variant state; `handleQueueSchedule()` handler; "Add to Queue" button |
| `apps/web/app/dashboard/calendar/CalendarClient.tsx` | `DroppableDay` + `DraggablePostDot` sub-components; `DndContext` wrapper; drag handlers with optimistic update + rollback |
| `apps/web/package.json` | Added `@dnd-kit/core`, `@dnd-kit/utilities` |

---

## Database Migrations

| Migration Name | What it does |
|---|---|
| `20260629000001_add_platform_variants_to_scheduled_posts` | Creates `PlatformVariant` table with `postId`, `platform`, `content`, `hashtags[]`, `mediaUrls[]`; unique index on `(postId, platform)`; cascades on post delete |
| `20260629000002_create_queue_slots` | Creates `QueueSlot` table with `workspaceId`, `dayOfWeek` (0–6), `timeOfDay` (HH:MM), `timezone` (IANA), `platform?`, `isActive`; index on `(workspaceId, isActive)` |

---

## New npm Dependencies

| Package | Version | Justification |
|---|---|---|
| `@dnd-kit/core` | ^6.x | Drag-and-drop for calendar (web only). Chosen over FullCalendar/react-big-calendar because the calendar grid is already hand-built — wrapping existing elements as draggable/droppable is far lighter than replacing the calendar runtime. |
| `@dnd-kit/utilities` | ^3.x | CSS transform helpers for `useDraggable` (CSS.Translate) |

No new API dependencies. Timezone math uses Node's built-in `Intl` API.

---

## New API Endpoints

### Phase 1 — Platform Variants

**`GET /api/v1/posts/calendar`**
- Auth: Bearer token (workspace access)
- Query: `workspaceId` (required), `startDate` (ISO, optional), `endDate` (ISO, optional)
- Response: `{ posts: [{ id, content, scheduledFor, platforms, status, mediaUrls, platformVariants }] }`

**Extended: `POST /api/v1/posts/schedule`**
- Added optional `platformVariants: [{ platform, content, hashtags[], mediaUrls[] }]`
- X variant enforces 280-char limit server-side (400 if exceeded)
- Duplicates deduplicated (last entry wins)

**Extended: `PATCH /api/v1/posts/:id`**
- Added optional `platformVariants` — deletes existing variants for post and recreates

### Phase 2 — Queue Slots

**`GET /api/v1/queue-slots`**
- Auth: Bearer token (workspace access)
- Query: `workspaceId`
- Response: `{ slots: [{ id, dayOfWeek, timeOfDay, timezone, platform, isActive }] }`

**`POST /api/v1/queue-slots`**
- Body: `{ workspaceId, dayOfWeek (0-6), timeOfDay (HH:MM), timezone (IANA), platform? }`
- Validates: dayOfWeek range, timeOfDay format, IANA timezone
- Response: `{ slot }` (201)

**`PATCH /api/v1/queue-slots/:id`**
- Body: any subset of `{ dayOfWeek, timeOfDay, timezone, platform, isActive }`
- Soft-enables/disables slot via `isActive`

**`DELETE /api/v1/queue-slots/:id`**
- Soft delete: sets `isActive = false` (204)

**`POST /api/v1/posts/queue-schedule`**
- Body: same as `/schedule` minus `scheduledFor`
- Returns 422 if no active slots configured: `"No queue slots configured. Add at least one slot before using the queue."`
- Returns 409 if all slots occupied 8 weeks out: `"No open queue slots available in the next 8 weeks."`
- On success: creates post at computed `scheduledFor`, returns `{ post, jobId, scheduledFor, requiresReview }`

---

## Known Limitations / Follow-up Items

1. **Week view**: The calendar is month-only. A week view toggle (showing hourly slots) would make drag-and-drop more precise for same-day time changes.

2. **Variant media uploads**: Platform variant `mediaUrls` currently accepts URLs only (same as master post). A per-variant media library picker would complete the workflow.

3. **Queue slot timezone display**: The slot manager shows the IANA timezone string raw (e.g. `America/New_York`). A friendly label (e.g. "Eastern Time (ET)") would improve UX.

4. **`getNextAvailableSlot` uses UTC date comparison**: Slots are resolved in the slot's timezone using the `Intl` API. This works correctly for Node 18+. Verify Railway/production Node version is ≥ 18 (it should be).

5. **Drag to same day**: Dropping a post on its current day is a no-op (detected via `isSameDay`). Intra-day time changes still require the edit dialog.

---

## Feature 10 — LinkedIn Integration (Full Platform)

**Date:** 2026-06-29

### Overview
Full LinkedIn integration as the 5th publishing platform, covering OAuth 2.0, post dispatch (text/image/video), token encryption, rate limiting, and frontend UI.

### Backend

**Environment variables added** (`apps/api/src/config/env.ts`):
- `LINKEDIN_CLIENT_ID` — LinkedIn app client ID
- `LINKEDIN_CLIENT_SECRET` — LinkedIn app client secret
- `LINKEDIN_REDIRECT_URI` — OAuth callback URL (e.g. `https://api.omnipulse.app/api/v1/social-accounts/oauth/callback`)
- `LINKEDIN_API_VERSION` — e.g. `202504`
- `TOKEN_ENCRYPTION_KEY` — 64-char hex (32 bytes) for AES-256-GCM token encryption

**New library: `apps/api/src/lib/tokenEncryption.ts`**
- AES-256-GCM encryption for OAuth access/refresh tokens
- Format: `"iv:tag:ciphertext"` (all base64)
- Passthrough mode if `TOKEN_ENCRYPTION_KEY` not set (dev fallback)
- `decryptToken()` handles plaintext passthrough for existing tokens

**New library: `apps/api/src/lib/linkedinToken.ts`**
- `isLinkedInTokenExpired(account)` — true if `tokenExpiresAt` is within 7 days
- `refreshLinkedInToken(account, userId)` — uses refresh token grant to renew; marks account expired and notifies user on failure

**New library: `apps/api/src/lib/linkedinPublisher.ts`**
- All requests include: `Authorization`, `LinkedIn-Version`, `X-Restli-Protocol-Version: 2.0.0`
- `publishLinkedInText(accessToken, personUrn, content)` → extracts post URN from `x-restli-id` header
- `publishLinkedInImage(...)` → two-step: initialize upload → PUT binary → poll AVAILABLE → create post
- `publishLinkedInVideo(...)` → four-step: initialize → chunked PUT (4 MB) → finalize → poll AVAILABLE → create post
- `pollUntilAvailable(fetcher, maxAttempts, baseDelayMs)` — exponential backoff helper
- Return type: `PublishResult = { success: true; postUrn } | { success: false; error; retryAfter?; details? }`

**Schema changes** (`apps/api/prisma/schema.prisma`):
- Added `LINKEDIN` to `Platform` enum
- Added to `SocialAccount`: `refreshToken`, `tokenExpiresAt`, `linkedinPersonUrn`, `linkedinOrganizationUrns (Json)`
- Migration files: `...0004_add_refresh_token_and_expiry...`, `...0005_add_linkedin_to_platform`

**OAuth route** (`apps/api/src/routes/socialAccounts.ts`):
- LinkedIn connect URL uses `openid profile email w_member_social` scopes
- Callback: exchanges code → gets userinfo → fetches org ACLs → encrypts tokens → upserts `SocialAccount`
- Returns `tokenExpiresAt` in GET response for frontend expiry badge

**Publisher worker** (`apps/api/src/workers/publishPost.worker.ts`):
- LinkedIn dispatch block runs before generic platform handler
- Redis rate-limiting: key `linkedin:posts:{userId}:{YYYY-MM-DD}`, limit 95/day
- Stale token: attempts refresh before publish; reschedules 1 hour later if refresh fails
- Dispatches to `publishLinkedInText/Image/Video` based on `mediaUrls`

### Frontend

**`packages/types/src/index.ts`**: Added `LINKEDIN = 'LINKEDIN'` to Platform enum

**`apps/web/app/dashboard/accounts/AccountsClient.tsx`**:
- Added LinkedIn to `PLATFORMS` array
- `PLATFORM_CONFIG.LINKEDIN`: color `#0A66C2`, OAuth-based connection
- LinkedIn SVG path added to `PlatformIcon`
- Token expiry warning badge in `PlatformCard`: shown when `tokenExpiresAt` ≤ 7 days

**`apps/web/app/dashboard/calendar/CreatePostForm.tsx`**:
- LinkedIn added to `VARIANT_PLATFORMS` with 3000-char limit
- Character counter with amber warning at ≥2800, red error at >3000

**`apps/web/app/dashboard/calendar/PostPreview.tsx`**:
- `LinkedInPreview` component mimicking LinkedIn post card UI
- LinkedIn added to validPlatforms filter and `renderPreview` switch

**Other updated files** (emoji/color maps):
- `BestTimesWidget.tsx`, `DashboardContent.tsx`, `InsightsClient.tsx`, `QueueSlotsManager.tsx`, `portal/[token]/page.tsx`

### LinkedIn App Setup (required)
1. Create app at [developer.linkedin.com](https://developer.linkedin.com)
2. Add products: **Share on LinkedIn**, **Sign In with LinkedIn using OpenID Connect**
3. Authorized redirect URL: `LINKEDIN_REDIRECT_URI` from env
4. Copy Client ID + Secret to env
5. For Company Pages: request **Marketing Developer Platform** access (separate approval)
