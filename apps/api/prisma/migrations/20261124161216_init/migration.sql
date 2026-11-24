-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sender" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL,
    "smtpPassword" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMP(3) NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 2000,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "totalEmails" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "teamName" TEXT,
    "accessToken" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "limit" INTEGER NOT NULL,
    "hitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Sender_userId_isActive_idx" ON "Sender"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Sender_userId_email_key" ON "Sender"("userId", "email");

-- CreateIndex
CREATE INDEX "Campaign_userId_createdAt_idx" ON "Campaign"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_status_startAt_idx" ON "Campaign"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Email_idempotencyKey_key" ON "Email"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Email_status_scheduledAt_idx" ON "Email"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Email_campaignId_status_idx" ON "Email"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Email_senderId_scheduledAt_idx" ON "Email"("senderId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Email_recipient_idx" ON "Email"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "SlackAccount_userId_key" ON "SlackAccount"("userId");

-- CreateIndex
CREATE INDEX "RateLimitEvent_senderId_hitAt_idx" ON "RateLimitEvent"("senderId", "hitAt");

-- AddForeignKey
ALTER TABLE "Sender" ADD CONSTRAINT "Sender_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackAccount" ADD CONSTRAINT "SlackAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
