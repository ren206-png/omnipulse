-- AddPostSeoMetadata sidecar (tenant-scoped, additive only)
CREATE TABLE IF NOT EXISTS "PostSeoMetadata" (
  "id"              TEXT NOT NULL,
  "postId"          TEXT NOT NULL,
  "workspaceId"     TEXT NOT NULL,
  "metaTitle"       TEXT,
  "metaDescription" TEXT,
  "ogTitle"         TEXT,
  "ogDescription"   TEXT,
  "ogType"          TEXT,
  "ogImageUrl"      TEXT,
  "keywords"        TEXT[] NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostSeoMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostSeoMetadata_postId_key"     ON "PostSeoMetadata"("postId");
CREATE INDEX        IF NOT EXISTS "PostSeoMetadata_workspaceId_idx" ON "PostSeoMetadata"("workspaceId");

ALTER TABLE "PostSeoMetadata"
  DROP CONSTRAINT IF EXISTS "PostSeoMetadata_postId_fkey";
ALTER TABLE "PostSeoMetadata"
  ADD CONSTRAINT "PostSeoMetadata_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostSeoMetadata"
  DROP CONSTRAINT IF EXISTS "PostSeoMetadata_workspaceId_fkey";
ALTER TABLE "PostSeoMetadata"
  ADD CONSTRAINT "PostSeoMetadata_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add altText to MediaAsset (nullable, additive)
ALTER TABLE "MediaAsset"     ADD COLUMN IF NOT EXISTS "altText" TEXT;

-- Add altText to PlatformVariant (nullable, additive)
ALTER TABLE "PlatformVariant" ADD COLUMN IF NOT EXISTS "altText" TEXT;
