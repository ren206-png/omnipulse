CREATE TABLE IF NOT EXISTS "PostApproval" (
  "id" TEXT NOT NULL,
  "portalToken" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "comment" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostApproval_portalToken_postId_key" ON "PostApproval"("portalToken", "postId");
CREATE INDEX IF NOT EXISTS "PostApproval_portalToken_idx" ON "PostApproval"("portalToken");
