CREATE TABLE "PostDlq" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "errorCode" INTEGER,
  "errorMessage" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostDlq_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostDlq_workspaceId_idx" ON "PostDlq"("workspaceId");
CREATE INDEX "PostDlq_resolvedAt_idx" ON "PostDlq"("resolvedAt");
ALTER TABLE "PostDlq" ADD CONSTRAINT "PostDlq_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
