# INCIDENT NOTE — Cross-Tenant Data Leak: content-health endpoint

**Severity:** CRITICAL  
**Status:** FIXED (commit pending)  
**Authored:** 2026-07-04  

---

## What was exposed

`GET /api/v1/posts/content-health?workspaceId=<any>` returned the last 90 days of scheduled post content, platform targets, and engagement metrics for ANY workspace when called by ANY authenticated user.

The endpoint read `workspaceId` directly from `req.query` and passed it to `prisma.scheduledPost.findMany({ where: { workspaceId } })` with no membership check.

**Data exposed per request:**
- Post content/captions for all posts in the target workspace
- Platform targets (Instagram, LinkedIn, X, etc.)
- Scheduled publish times
- Engagement metrics (likes, comments, shares, reach) where synced

---

## Since when

The endpoint was present from the initial codebase. Best evidence: the `content-health` route exists in the initial commit with no access control on the `workspaceId` query parameter. All workspaces created since the platform launched could have been readable.

---

## Which tenants could be affected

All tenants. Any authenticated user (including free-tier users who self-registered) could enumerate workspace IDs and read any workspace's content. Workspace IDs are UUIDs (not sequential), so exploitation required knowledge or brute-force of valid UUIDs.

---

## Fix applied

`apps/api/src/routes/posts.ts:693–694`: Added `getWorkspaceRole(workspaceId, req.user!.id)` check returning 403 for non-members, identical to the pattern used on all other workspace-scoped routes.

---

## Ren's decision required

- [ ] Assess whether any workspace IDs were exposed to users outside their tenant (e.g., via shared URLs, logs, or API key misuse)
- [ ] Determine whether disclosure to affected tenants is warranted
- [ ] Review access logs for anomalous `content-health` calls with foreign workspace IDs
