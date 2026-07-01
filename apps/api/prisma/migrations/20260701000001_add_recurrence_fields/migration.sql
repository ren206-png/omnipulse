-- AlterTable
ALTER TABLE "ScheduledPost" ADD COLUMN "recurrenceFreq" TEXT,
ADD COLUMN "recurrenceEndsAt" TIMESTAMP(3),
ADD COLUMN "recurrenceParentId" TEXT;
