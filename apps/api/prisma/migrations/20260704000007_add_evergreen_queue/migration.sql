CREATE TABLE "EvergreenQueue" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "minIntervalDays" INTEGER NOT NULL DEFAULT 45,
  "lastRecycledAt" TIMESTAMP(3),
  "nextRecycleAfter" TIMESTAMP(3),
  "autoPublish" BOOLEAN NOT NULL DEFAULT false,
  "seasonalExclusions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvergreenQueue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvergreenQueue_postId_key" ON "EvergreenQueue"("postId");
CREATE INDEX "EvergreenQueue_workspaceId_idx" ON "EvergreenQueue"("workspaceId");
CREATE INDEX "EvergreenQueue_nextRecycleAfter_active_idx" ON "EvergreenQueue"("nextRecycleAfter", "active");
ALTER TABLE "EvergreenQueue" ADD CONSTRAINT "EvergreenQueue_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvergreenQueue" ADD CONSTRAINT "EvergreenQueue_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
