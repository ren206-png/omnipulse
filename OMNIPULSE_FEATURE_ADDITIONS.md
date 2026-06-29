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
