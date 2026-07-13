-- Add CLIENT_APPROVER to WorkspaceRole enum
ALTER TYPE "WorkspaceRole" ADD VALUE 'CLIENT_APPROVER';

CREATE TABLE "ApprovalMagicLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalMagicLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApprovalMagicLink_token_key" ON "ApprovalMagicLink"("token");
CREATE INDEX "ApprovalMagicLink_workspaceId_idx" ON "ApprovalMagicLink"("workspaceId");
CREATE INDEX "ApprovalMagicLink_token_idx" ON "ApprovalMagicLink"("token");
ALTER TABLE "ApprovalMagicLink" ADD CONSTRAINT "ApprovalMagicLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceBranding" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#6366f1',
  "companyName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceBranding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceBranding_workspaceId_key" ON "WorkspaceBranding"("workspaceId");
ALTER TABLE "WorkspaceBranding" ADD CONSTRAINT "WorkspaceBranding_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
