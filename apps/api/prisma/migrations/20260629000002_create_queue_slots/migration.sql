-- Migration: create_queue_slots
CREATE TABLE IF NOT EXISTS "QueueSlot" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dayOfWeek"   INTEGER NOT NULL,
    "timeOfDay"   TEXT NOT NULL,
    "timezone"    TEXT NOT NULL,
    "platform"    TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueueSlot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QueueSlot"
    ADD CONSTRAINT "QueueSlot_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "QueueSlot_workspaceId_isActive_idx"
    ON "QueueSlot"("workspaceId", "isActive");
