/*
  Warnings:

  - The `platform` column on the `QueueSlot` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `threadSlides` on the `ScheduledPost` table. All the data in the column will be lost.
  - You are about to drop the `PostApproval` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `platform` on the `PlatformVariant` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `ScheduledPost` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ClientPortal" ALTER COLUMN "token" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MediaAsset" ALTER COLUMN "tags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PlatformVariant" DROP COLUMN "platform",
ADD COLUMN     "platform" "Platform" NOT NULL,
ALTER COLUMN "hashtags" DROP DEFAULT,
ALTER COLUMN "mediaUrls" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PostSeoMetadata" ALTER COLUMN "keywords" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "QueueSlot" DROP COLUMN "platform",
ADD COLUMN     "platform" "Platform",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ScheduledPost" DROP COLUMN "threadSlides",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SharedReport" ALTER COLUMN "token" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "twoFactorBackupCodes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkspaceInvitation" ALTER COLUMN "token" DROP DEFAULT;

-- DropTable
DROP TABLE "PostApproval";

-- DropEnum
DROP TYPE "PostStatus_new";

-- CreateIndex
CREATE INDEX "ListeningKeyword_workspaceId_idx" ON "ListeningKeyword"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformVariant_postId_platform_key" ON "PlatformVariant"("postId", "platform");

-- AddForeignKey
ALTER TABLE "AttributionEvent" ADD CONSTRAINT "AttributionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "automation_conversations_workspaceId_channel_providerConversati" RENAME TO "automation_conversations_workspaceId_channel_providerConver_idx";

-- RenameIndex
ALTER INDEX "inbound_automation_events_workspaceId_channel_idempotencyKey_ke" RENAME TO "inbound_automation_events_workspaceId_channel_idempotencyKe_key";
