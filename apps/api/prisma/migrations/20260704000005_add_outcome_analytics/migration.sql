CREATE TABLE "PostAttribution" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "trackedNumber" TEXT,
  "utmTag" TEXT,
  "callsReceived" INTEGER NOT NULL DEFAULT 0,
  "bookingsCreated" INTEGER NOT NULL DEFAULT 0,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostAttribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostAttribution_postId_key" ON "PostAttribution"("postId");
CREATE INDEX "PostAttribution_workspaceId_idx" ON "PostAttribution"("workspaceId");
CREATE INDEX "PostAttribution_trackedNumber_idx" ON "PostAttribution"("trackedNumber");
CREATE INDEX "PostAttribution_utmTag_idx" ON "PostAttribution"("utmTag");
ALTER TABLE "PostAttribution" ADD CONSTRAINT "PostAttribution_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostAttribution" ADD CONSTRAINT "PostAttribution_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AttributionEvent" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttributionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AttributionEvent_postId_idx" ON "AttributionEvent"("postId");
CREATE INDEX "AttributionEvent_workspaceId_idx" ON "AttributionEvent"("workspaceId");
