-- Migration: add_missing_indexes
-- Adds indexes on high-frequency foreign key columns that were missing,
-- improving query performance for workspace-scoped queries, analytics lookups,
-- and post scheduling flows.

-- SocialAccount: queried by workspace on every post publish + account list
CREATE INDEX IF NOT EXISTS "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");
CREATE INDEX IF NOT EXISTS "SocialAccount_workspaceId_platform_idx" ON "SocialAccount"("workspaceId", "platform");

-- ScheduledPost: missing workspace index (had status+scheduledFor but not workspace-scoped variants)
CREATE INDEX IF NOT EXISTS "ScheduledPost_workspaceId_idx" ON "ScheduledPost"("workspaceId");
CREATE INDEX IF NOT EXISTS "ScheduledPost_workspaceId_status_idx" ON "ScheduledPost"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "ScheduledPost_workspaceId_scheduledFor_idx" ON "ScheduledPost"("workspaceId", "scheduledFor");

-- AnalyticsSnapshot: queried by socialAccountId + recordedAt for trend charts
CREATE INDEX IF NOT EXISTS "AnalyticsSnapshot_socialAccountId_recordedAt_idx" ON "AnalyticsSnapshot"("socialAccountId", "recordedAt");

-- ContentTemplate: listed by workspace
CREATE INDEX IF NOT EXISTS "ContentTemplate_workspaceId_idx" ON "ContentTemplate"("workspaceId");
CREATE INDEX IF NOT EXISTS "ContentTemplate_workspaceId_category_idx" ON "ContentTemplate"("workspaceId", "category");

-- SharedReport: listed by workspace
CREATE INDEX IF NOT EXISTS "SharedReport_workspaceId_idx" ON "SharedReport"("workspaceId");

-- WorkspaceInvitation: listed by workspace
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_idx" ON "WorkspaceInvitation"("workspaceId");

-- PostDlq: queried by postId when resolving individual post failures
CREATE INDEX IF NOT EXISTS "PostDlq_postId_idx" ON "PostDlq"("postId");
