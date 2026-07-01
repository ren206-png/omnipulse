CREATE TABLE IF NOT EXISTS "ShortLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShortLink_slug_key" ON "ShortLink"("slug");
CREATE INDEX IF NOT EXISTS "ShortLink_workspaceId_idx" ON "ShortLink"("workspaceId");
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
