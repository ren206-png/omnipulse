-- Add missing enums
DO $$ BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostStatus_new" AS ENUM ('DRAFT', 'QUEUED', 'PENDING_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Alter PostStatus to add new values
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

DO $$ BEGIN
  CREATE TYPE "InboxMessageType" AS ENUM ('COMMENT', 'MENTION', 'DM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InboxMessageStatus" AS ENUM ('UNREAD', 'READ', 'REPLIED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add missing columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- Add missing columns to Workspace
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "plan" "Plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "brandName" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "brandLogoUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "brandColor" TEXT DEFAULT '#6366f1';
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_customDomain_key" ON "Workspace"("customDomain");

-- Add missing columns to ScheduledPost
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "submittedBy" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "evergreen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "evergreenInterval" INTEGER;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "evergreenParentId" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "queuePosition" INTEGER;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "firstComment" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "abVariantOf" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "abTestActive" BOOLEAN NOT NULL DEFAULT false;

-- WorkspaceMember
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT IF EXISTS "WorkspaceMember_workspaceId_fkey";
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" DROP CONSTRAINT IF EXISTS "WorkspaceMember_userId_fkey";
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkspaceInvitation
CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_email_key" ON "WorkspaceInvitation"("workspaceId", "email");
ALTER TABLE "WorkspaceInvitation" DROP CONSTRAINT IF EXISTS "WorkspaceInvitation_workspaceId_fkey";
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SharedReport
CREATE TABLE IF NOT EXISTS "SharedReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "SharedReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SharedReport_token_key" ON "SharedReport"("token");
ALTER TABLE "SharedReport" DROP CONSTRAINT IF EXISTS "SharedReport_workspaceId_fkey";
ALTER TABLE "SharedReport" ADD CONSTRAINT "SharedReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ContentTemplate
CREATE TABLE IF NOT EXISTS "ContentTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "platforms" "Platform"[],
    "category" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ContentTemplate" DROP CONSTRAINT IF EXISTS "ContentTemplate_workspaceId_fkey";
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostMetric
CREATE TABLE IF NOT EXISTS "PostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostMetric_postId_platform_key" ON "PostMetric"("postId", "platform");
CREATE INDEX IF NOT EXISTS "PostMetric_postId_idx" ON "PostMetric"("postId");
ALTER TABLE "PostMetric" DROP CONSTRAINT IF EXISTS "PostMetric_postId_fkey";
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InboxMessage
CREATE TABLE IF NOT EXISTS "InboxMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorHandle" TEXT,
    "content" TEXT NOT NULL,
    "type" "InboxMessageType" NOT NULL DEFAULT 'COMMENT',
    "status" "InboxMessageStatus" NOT NULL DEFAULT 'UNREAD',
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_socialAccountId_externalId_key" ON "InboxMessage"("socialAccountId", "externalId");
CREATE INDEX IF NOT EXISTS "InboxMessage_workspaceId_status_idx" ON "InboxMessage"("workspaceId", "status");
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_workspaceId_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" DROP CONSTRAINT IF EXISTS "InboxMessage_socialAccountId_fkey";
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BioPage
CREATE TABLE IF NOT EXISTS "BioPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BioPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BioPage_workspaceId_key" ON "BioPage"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "BioPage_slug_key" ON "BioPage"("slug");
ALTER TABLE "BioPage" DROP CONSTRAINT IF EXISTS "BioPage_workspaceId_fkey";
ALTER TABLE "BioPage" ADD CONSTRAINT "BioPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BioLink
CREATE TABLE IF NOT EXISTS "BioLink" (
    "id" TEXT NOT NULL,
    "bioPageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "icon" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BioLink_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BioLink" DROP CONSTRAINT IF EXISTS "BioLink_bioPageId_fkey";
ALTER TABLE "BioLink" ADD CONSTRAINT "BioLink_bioPageId_fkey" FOREIGN KEY ("bioPageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ActivityLog
CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_createdAt_idx" ON "ActivityLog"("workspaceId", "createdAt");
ALTER TABLE "ActivityLog" DROP CONSTRAINT IF EXISTS "ActivityLog_workspaceId_fkey";
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RssFeed
CREATE TABLE IF NOT EXISTS "RssFeed" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" "Platform"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "checkInterval" INTEGER NOT NULL DEFAULT 60,
    "lastCheckedAt" TIMESTAMP(3),
    "lastItemGuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RssFeed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RssFeed_workspaceId_url_key" ON "RssFeed"("workspaceId", "url");
ALTER TABLE "RssFeed" DROP CONSTRAINT IF EXISTS "RssFeed_workspaceId_fkey";
ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WebhookEndpoint
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_workspaceId_idx" ON "WebhookEndpoint"("workspaceId");
ALTER TABLE "WebhookEndpoint" DROP CONSTRAINT IF EXISTS "WebhookEndpoint_workspaceId_fkey";
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ApiKey
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "ApiKey_workspaceId_fkey";
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ClientPortal
CREATE TABLE IF NOT EXISTS "ClientPortal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientPortal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortal_workspaceId_key" ON "ClientPortal"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortal_token_key" ON "ClientPortal"("token");
ALTER TABLE "ClientPortal" DROP CONSTRAINT IF EXISTS "ClientPortal_workspaceId_fkey";
ALTER TABLE "ClientPortal" ADD CONSTRAINT "ClientPortal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CompetitorAccount
CREATE TABLE IF NOT EXISTS "CompetitorAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorAccount_workspaceId_platform_handle_key" ON "CompetitorAccount"("workspaceId", "platform", "handle");
ALTER TABLE "CompetitorAccount" DROP CONSTRAINT IF EXISTS "CompetitorAccount_workspaceId_fkey";
ALTER TABLE "CompetitorAccount" ADD CONSTRAINT "CompetitorAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CompetitorSnapshot
CREATE TABLE IF NOT EXISTS "CompetitorSnapshot" (
    "id" TEXT NOT NULL,
    "competitorAccountId" TEXT NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "estimatedEngagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_competitorAccountId_recordedAt_idx" ON "CompetitorSnapshot"("competitorAccountId", "recordedAt");
ALTER TABLE "CompetitorSnapshot" DROP CONSTRAINT IF EXISTS "CompetitorSnapshot_competitorAccountId_fkey";
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_competitorAccountId_fkey" FOREIGN KEY ("competitorAccountId") REFERENCES "CompetitorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
