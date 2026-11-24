-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailStatus" ADD VALUE 'RETRYING';
ALTER TYPE "EmailStatus" ADD VALUE 'RATE_LIMITED';

-- DropIndex
DROP INDEX "RateLimitEvent_senderId_hitAt_idx";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "deferredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enqueuedAt" TIMESTAMP(3),
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "processingAt" TIMESTAMP(3),
ADD COLUMN     "searchDirty" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SlackAccount" ADD COLUMN     "botUserId" TEXT,
ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "channelName" TEXT,
ADD COLUMN     "slackUserId" TEXT;

-- AlterTable
ALTER TABLE "RateLimitEvent" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'sender',
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_userId_requestKey_key" ON "Campaign"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "Email_searchDirty_idx" ON "Email"("searchDirty");

-- CreateIndex
CREATE INDEX "RateLimitEvent_userId_hitAt_idx" ON "RateLimitEvent"("userId", "hitAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitEvent_senderId_scope_windowStart_key" ON "RateLimitEvent"("senderId", "scope", "windowStart");

