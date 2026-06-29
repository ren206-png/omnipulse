-- Migration: add_platform_variants_to_scheduled_posts
CREATE TABLE IF NOT EXISTS "PlatformVariant" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "platform"  TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "hashtags"  TEXT[] NOT NULL DEFAULT '{}',
    "mediaUrls" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformVariant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformVariant"
    ADD CONSTRAINT "PlatformVariant_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformVariant_postId_platform_key"
    ON "PlatformVariant"("postId", "platform");
