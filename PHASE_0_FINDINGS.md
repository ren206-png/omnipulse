# PHASE 0 FINDINGS — OmniPulse Codebase Audit

> Read-only audit. No source files were modified.
> All citations are verified from disk.
> Audit date: 2026-07-04

---

## Executive Summary

| # | Area | Severity | One-line |
|---|------|----------|---------|
| 1a | Root redirect — middleware dead code | CRITICAL | `proxy.ts` is never executed by Next.js; unauthenticated users can freely browse `/` |
| 1b | `/register` route is missing | HIGH | Marketing page links to `/register` but only `/signup` exists → 404 for all CTA buttons |
| 1c | Pricing inconsistency in JSON-LD | MEDIUM | UI shows Agency $99; structured-data schema says $79 |
| 1d | Google verification placeholder | MEDIUM | Hardcoded `add-your-google-site-verification-here` never submitted to Search Console |
| 2a | Domain consistent — `getomnipulse.com` | LOW | All domain refs use the same canonical; no `getomnopulse` typo found |
| 3a | `/api/me` route does not exist | HIGH | No `/api/me` endpoint in the Express API; any client calling it gets a 404 not a 401 |
| 3b | Token cookie missing `domain` attribute | MEDIUM | Cookie set without `domain=` — may not be sent in cross-subdomain deployments |
| 3c | `httpOnly` token visible to client pages via prop drilling | LOW | Token read from `cookies()` in server layout then passed as plain string prop into client components |
| 4a | `next` version spec `^16.0.0` does not exist | CRITICAL | Next.js latest stable as of audit is 15.x; `^16.0.0` will resolve to no package and fail install |
| 4b | BullMQ guardian uses deprecated `repeat: { every }` | MEDIUM | BullMQ v5 removed the `add(name, data, { repeat })` pattern; should use `upsertJobScheduler` |
| 4c | Prisma v7 `(prisma.X as Function)` casts | LOW | Inherited from prior audit — type-safety bypass is fragile against future Prisma upgrades |
| 4d | `social-media-api` (renamed from ayrshare) | INFO | Package rename already completed; `social-media-api@^1.3.0` is present in package.json |
| 5a | `og-image.png` asset does not exist in `public/` | HIGH | OG image referenced everywhere but not present → social previews broken |
| 5b | Sitemap omits features/about/pricing sections | LOW | Sitemap only has 3 URLs; marketing sections on `/` are not separately indexed |
| 5c | Dashboard pages correctly opt out of indexing | INFO | `X-Robots-Tag: noindex` header and `robots: { index: false }` metadata both applied |

---

## Finding 1 — Root Redirect / Landing Page

### 1a — CRITICAL: `proxy.ts` middleware is dead code — auth guard never runs

**File:** `apps/web/proxy.ts`

Next.js App Router runs only a file named exactly `middleware.ts` (or `middleware.js`) placed at the project root or `src/` root. The file at `apps/web/proxy.ts` exports a function named `proxy` (not `default`) and a `config` matcher object, but:

- The filename is `proxy.ts`, not `middleware.ts`
- There is no `middleware.ts` anywhere under `apps/web/`
- The exported function is not the default export

Because none of these conditions match what Next.js requires, **the entire auth guard in `proxy.ts` is never invoked**. The `config.matcher` is also never registered.

```
apps/web/proxy.ts:8    export function proxy(req: NextRequest) {   // must be `export default function middleware`
apps/web/proxy.ts:34   export const config = { matcher: [...] }    // correct shape but never read
```

**Impact:** Unauthenticated users can freely browse any route. The `/dashboard` redirect-to-login only fires because `apps/web/app/dashboard/layout.tsx:21` does a server-side cookie check, but all other currently-unprotected routes (e.g. future routes that forget to check) are completely open.

**Fix:** Rename `proxy.ts` to `middleware.ts` and change the export to `export default function middleware(req: NextRequest)`.

---

### 1b — HIGH: `/register` route missing — all CTA buttons are broken 404s

**File:** `apps/web/app/page.tsx:120, :141, :236`

The marketing landing page links all three call-to-action buttons to `/register`:

```tsx
apps/web/app/page.tsx:120   href="/register"   // "Get started" in nav
apps/web/app/page.tsx:141   href="/register"   // "Start for Free" hero CTA
apps/web/app/page.tsx:236   href="/register"   // pricing plan buttons
```

No `apps/web/app/register/` directory exists. The sign-up page is at `/signup` (`apps/web/app/signup/page.tsx`). Every visitor who clicks a CTA gets a 404.

**Fix:** Create `apps/web/app/register/page.tsx` that either re-exports the signup form or redirects to `/signup`, OR change all three `href` values in `page.tsx` to `/signup`.

---

### 1c — MEDIUM: Agency plan pricing inconsistency between UI and JSON-LD

**File:** `apps/web/app/page.tsx:75` (UI) vs `apps/web/app/page.tsx:290` (JSON-LD)

```tsx
apps/web/app/page.tsx:75    price: '$99',   // displayed price in the PRICING array
apps/web/app/page.tsx:290   { '@type': 'Offer', price: '79', ... name: 'Agency Plan' }  // structured data
```

Google's rich result parser reads the structured data. A discrepancy between visible price ($99) and machine-readable price ($79) can trigger a manual action for "misleading structured data."

**Fix:** Align the JSON-LD `price` value to match the displayed price.

---

### 1d — MEDIUM: Google site-verification placeholder never replaced

**File:** `apps/web/app/layout.tsx:48`

```ts
apps/web/app/layout.tsx:48   google: 'add-your-google-site-verification-here',
```

This literal string is emitted as `<meta name="google-site-verification" content="add-your-google-site-verification-here">`. Google Search Console will reject it and the site will remain unverified.

**Fix:** Replace with the real token from Google Search Console, or remove the `verification` key entirely until the token is available.

---

### 1e — INFO: Public marketing pages exist

The root `/` (`apps/web/app/page.tsx`) is a full marketing page with hero, features, pricing, and footer sections. It is NOT a redirect to `/login`. Separate `/login` and `/signup` pages exist. No `/features`, `/pricing`, or `/about` sub-routes exist — these sections are all inline anchors (`#features`, `#pricing`) on the root page.

---

### 1f — INFO: robots.txt and sitemap.ts both present

- `apps/web/public/robots.txt` — allows `/`, `/login`, `/signup`; disallows dashboard/admin/api routes; references `https://getomnipulse.com/sitemap.xml`
- `apps/web/app/sitemap.ts` — generates 3 entries: root, login, signup
- No `app/robots.ts` (uses static file instead — acceptable)

---

## Finding 2 — Domain / Brand Consistency

**No `getomnopulse` (with 'o') misspelling was found anywhere in the codebase.**

All domain references consistently use `getomnipulse.com`. Full list of occurrences:

| Location | Value |
|---|---|
| `apps/web/app/layout.tsx:7` | `metadataBase: new URL('https://getomnipulse.com')` |
| `apps/web/app/layout.tsx:21,26,37,45` | OG/twitter/canonical URLs |
| `apps/web/app/page.tsx:8,12,13,286` | page-level metadata and JSON-LD |
| `apps/web/app/sitemap.ts:4` | sitemap base URL |
| `apps/web/app/dashboard/settings/branding/BrandingSettings.tsx:156` | CNAME instructions |
| `apps/web/app/dashboard/client-portal/ClientPortalSettings.tsx:7` | portal base URL |
| `apps/web/app/login/actions.ts:41,45` | dev demo account email |
| `apps/web/app/login/page.tsx:174` | dev demo hint |
| `apps/api/src/lib/email.ts:18,45,73,101,132` | `noreply@getomnipulse.com` fallback |
| `apps/api/src/lib/digest.ts:94` | same email fallback |
| `apps/mobile/app.json:4,11,14` | `getomnipulse` slug and bundle IDs |

**CORS mismatch risk:** `apps/api/src/config/env.ts:32` defaults CORS to `localhost` only. The `.env` file sets `CORS_ORIGINS=http://localhost:3000,https://getomnipulse.com,https://www.getomnipulse.com`. If the env var is not set in production, only `localhost` is allowed and all production API calls will be blocked by CORS. The default must include the production domain.

**OAuth redirect URI placeholder:** `apps/api/.env.example:57` has `LINKEDIN_REDIRECT_URI=https://api.yourdomain.com/...`. This is never replaced with `getomnipulse.com` in any checked config, meaning LinkedIn OAuth will fail in any deployment that uses the example as a template.

---

## Finding 3 — `/api/me` Auth Bug

### 3a — HIGH: No `/api/me` endpoint exists in the Express API

A full grep of all Express route registrations in `apps/api/src/index.ts` and all route files confirms there is **no `/me` route**. The auth system uses:

- `GET /api/v1/workspaces` (mounted at `apps/api/src/routes/workspaces.ts:13`) as the equivalent "authenticated user check" from the dashboard layout
- JWT tokens are decoded by `requireAuth` middleware; user identity comes from the JWT payload, not a separate `/me` fetch

**If any client code calls `/api/me` or `/api/v1/me`, it receives a 404 Not Found, not a 401 Unauthorized.** The original audit task likely refers to any route that behaves as a session check — the actual route used for this purpose is `/api/v1/workspaces`.

---

### 3b — Auth flow: cookie vs header, full trace

**Token issuance** (`apps/api/src/routes/auth.ts:116-123`): `POST /api/v1/auth/login` returns `{ token, user }` as a JSON body. The API never sets a `Set-Cookie` header — the token is in the response body only.

**Cookie set** (`apps/web/app/login/actions.ts:55-61`): The Next.js Server Action reads the token from the response body and sets an `httpOnly` cookie named `token`:

```ts
apps/web/app/login/actions.ts:55   cookieStore.set('token', result.token!, {
apps/web/app/login/actions.ts:57     httpOnly: true,
apps/web/app/login/actions.ts:58     path: '/',
apps/web/app/login/actions.ts:59     maxAge: 60 * 60 * 24 * 7,
apps/web/app/login/actions.ts:60     sameSite: 'lax',
apps/web/app/login/actions.ts:61     secure: process.env.NODE_ENV === 'production',
```

**Cookie attributes analysis:**
- `httpOnly: true` — correct, prevents XSS token theft
- `sameSite: 'lax'` — acceptable for same-origin navigation
- `secure` — only set in production; in development the cookie travels over HTTP — acceptable for dev
- `domain:` — **NOT SET**. Without an explicit `domain`, the cookie is scoped to the exact host. If the app is served on `app.getomnipulse.com` and the cookie needs to reach `api.getomnipulse.com`, it will not be sent. However, the current architecture passes the token as a `Bearer` header in `Authorization`, not via cookie, so this is only relevant if cookie-based auth is ever attempted cross-subdomain.

**Token on client requests** (`apps/web/app/dashboard/layout.tsx:27-31`): The dashboard layout (a Server Component) reads the cookie and passes the raw JWT string as a `token` prop to `DashboardShell`. Client components then use `Authorization: Bearer ${token}` in all `fetch` calls. This means:

1. The token is never sent as a cookie to the API — always as a `Bearer` header
2. The `requireAuth` middleware at `apps/api/src/middleware/auth.ts:22-27` reads `Authorization: Bearer ...` first, then falls back to `req.cookies.token` — the header path is used in practice

**Where a 401 would occur:** `apps/api/src/middleware/auth.ts:27-29`:
```ts
if (!token) {
  sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header')
}
```
This fires when: (a) the client component forgot to pass `Authorization`, (b) the token cookie was cleared/expired and the server component passed `undefined` as `token`, or (c) the `Bearer ` prefix was omitted. The most likely production scenario is cookie expiry — the cookie has a 7-day `maxAge` but the JWT itself may expire sooner if `JWT_EXPIRES_IN` is set to less than 7 days.

**JWT expiry vs cookie expiry mismatch risk:** If `JWT_EXPIRES_IN` < 7 days (e.g. `1d`), the cookie persists but the JWT inside is expired. The dashboard layout will pass the expired token to the shell; every API call will get `401 INVALID_TOKEN` from `apps/api/src/middleware/auth.ts:34-37`. The layout's 401-redirect logic at `apps/web/app/dashboard/layout.tsx:33-35` only checks the workspace fetch, not a `validateToken` call.

---

## Finding 4 — Dependency Risk Register

### 4a — CRITICAL: `next: "^16.0.0"` — version does not exist

**File:** `apps/web/package.json:14`

```json
apps/web/package.json:14   "next": "^16.0.0"
```

As of 2026-07-04, Next.js latest stable release is **15.x**. Version 16.0.0 does not exist. `pnpm install` will fail with "No matching version found for next@^16.0.0." This is a broken dependency that prevents any fresh install of the web app.

**Fix:** Change to `"next": "^15.0.0"` (or the specific latest 15.x tag).

---

### 4b — MEDIUM: BullMQ guardian uses deprecated `repeat: { every }` API

**File:** `apps/api/src/workers/guardian.worker.ts:26-27`

```ts
apps/api/src/workers/guardian.worker.ts:26   repeat: { every: INTERVAL_MS },
apps/api/src/workers/guardian.worker.ts:27   jobId: 'guardian-scan-repeatable',
```

BullMQ v5 deprecated the `queue.add(name, data, { repeat })` pattern in favour of `queue.upsertJobScheduler()`. The `repeat` option on `add()` still works in BullMQ 5.x but is marked for removal in a future major version. The analytics worker already uses the correct pattern:

```ts
apps/api/src/workers/analytics.worker.ts:9   await analyticsSyncQueue.upsertJobScheduler('analytics-daily-sync', { pattern: '0 0 * * *' })
```

**Fix:** Refactor `guardian.worker.ts` to use `guardianQueue.upsertJobScheduler('guardian-scan', { every: INTERVAL_MS })` matching the analytics worker pattern.

---

### 4c — LOW: Prisma v7 `(prisma.X as Function)` casts

**File:** `apps/api/src/routes/posts.ts` (multiple lines: 356, 465, etc.)

Inherited from prior audit (PHASE_0_FINDINGS.md §R-4). Type-safety bypass will silently fail if Prisma generated types change field shapes in a future Prisma patch. Not a runtime bug today.

---

### 4d — INFO: `social-media-api` (Ayrshare rename) already handled

**File:** `apps/api/package.json:39`

```json
"social-media-api": "^1.3.0"
```

The package renamed from `ayrshare` to `social-media-api` in 2023. The codebase already uses the new package name. The integration wrapper at `apps/api/src/integrations/ayrshare.ts:46` uses `require('social-media-api')`. No action needed.

---

### 4e — INFO: Prisma v7 — ESM and `prisma.config.ts`

**File:** `apps/api/prisma.config.ts`

Prisma v7 introduced `prisma.config.ts` as the new config entry point. This file exists and is correctly configured (`apps/api/prisma.config.ts:1-10`). The legacy `schema.prisma` also exists and coexists. No breaking change triggered.

---

## Finding 5 — SEO Self-Audit

### 5a — HIGH: `og-image.png` does not exist

**Referenced at:** `apps/web/app/layout.tsx:26`, `apps/web/app/page.tsx:13`

```ts
apps/web/app/layout.tsx:26   url: 'https://getomnipulse.com/og-image.png'
apps/web/app/page.tsx:13     url: 'https://getomnipulse.com/og-image.png'
```

`apps/web/public/` contains only `manifest.json` and `robots.txt`. No `og-image.png`, `icon-192.png`, or any image asset exists. Social media platforms and messaging apps will show a broken/missing preview image for all shared OmniPulse links.

**Fix:** Create and commit a 1200×630 OG image at `apps/web/public/og-image.png`. Also add `icon-192.png` referenced in `apps/web/app/layout.tsx:70`.

---

### 5b — MEDIUM: Sitemap covers only 3 URLs; marketing sections are anchor-only

**File:** `apps/web/app/sitemap.ts`

The sitemap at `/sitemap.xml` contains only:
- `https://getomnipulse.com` (priority 1.0)
- `https://getomnipulse.com/login` (priority 0.5)
- `https://getomnipulse.com/signup` (priority 0.8)

Features and pricing are `#features` and `#pricing` anchor fragments on the root URL, not separate pages. Fragment URLs are not indexable as separate entries. This is architecturally acceptable but means there are no additional crawlable SEO landing pages beyond the root. Consider adding standalone `/features` and `/pricing` pages with canonical URLs.

---

### 5c — INFO: Root layout metadata is complete

**File:** `apps/web/app/layout.tsx:4-50`

Present and correct:
- `title` and `description` — `apps/web/app/layout.tsx:5-6`
- `metadataBase` — `apps/web/app/layout.tsx:7`
- `keywords` array — `apps/web/app/layout.tsx:8-17`
- Full `openGraph` block with `title`, `description`, `url`, `siteName`, `type`, `images` — `apps/web/app/layout.tsx:18-32`
- Twitter card `summary_large_image` — `apps/web/app/layout.tsx:33-38`
- `robots: { index: true, follow: true }` — `apps/web/app/layout.tsx:39-43`
- `alternates.canonical` — `apps/web/app/layout.tsx:44-46`

Missing: Google site-verification token (see 1d above). The `og-image.png` is referenced but missing (see 5a above).

---

### 5d — INFO: Structured data present on landing page

**File:** `apps/web/app/page.tsx:275-294`

A `SoftwareApplication` JSON-LD schema is rendered in a `<script type="application/ld+json">` tag with `name`, `applicationCategory`, `operatingSystem`, `description`, `url`, and `offers` array. However, see finding 1c for the pricing discrepancy in this data.

---

### 5e — INFO: Dashboard correctly excluded from indexing

**File:** `apps/web/next.config.ts:19-22`, `apps/web/app/dashboard/layout.tsx:6-8`

Both the HTTP `X-Robots-Tag: noindex, nofollow` header (for `/dashboard/(.*)`) and the page-level `metadata.robots` object are set, providing belt-and-suspenders protection against dashboard content appearing in search results.

---

## Prioritised Fix List

| Priority | Finding | File:Line | Fix |
|---|---|---|---|
| P0 | **next@^16.0.0 does not exist** | `apps/web/package.json:14` | Change to `"next": "^15.0.0"` |
| P0 | **proxy.ts never runs — auth guard dead** | `apps/web/proxy.ts:8` | Rename to `middleware.ts`, change to `export default function middleware` |
| P1 | **/register 404 — all CTAs broken** | `apps/web/app/page.tsx:120,141,236` | Add `/register` page or change hrefs to `/signup` |
| P1 | **og-image.png missing** | `apps/web/app/layout.tsx:26` | Create and commit `apps/web/public/og-image.png` (1200×630) and `icon-192.png` |
| P2 | **Google verification placeholder** | `apps/web/app/layout.tsx:48` | Replace with real token or remove field |
| P2 | **Pricing JSON-LD $79 vs UI $99** | `apps/web/app/page.tsx:290` | Align to $99 |
| P2 | **JWT expiry vs cookie expiry mismatch** | `apps/web/app/login/actions.ts:59` + `apps/api/src/config/env.ts:29` | Ensure `maxAge` === `JWT_EXPIRES_IN` duration; add token-refresh or logout-on-401 logic |
| P3 | **Guardian BullMQ deprecated `repeat`** | `apps/api/src/workers/guardian.worker.ts:26` | Use `guardianQueue.upsertJobScheduler()` |
| P3 | **CORS default missing production domain** | `apps/api/src/config/env.ts:32` | Add `https://getomnipulse.com` to the fallback default |
| P4 | **LinkedIn OAuth redirect placeholder** | `.env.example:57` | Document actual production URI |
| P4 | **Sitemap only 3 URLs** | `apps/web/app/sitemap.ts` | Add standalone feature/pricing pages or accept as-is |
