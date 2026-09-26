
-- CreateEnum
CREATE TYPE "DiscountAppliesTo" AS ENUM ('CREDIT_TOP_UP', 'COURSE_PURCHASE', 'ALL');

-- CreateEnum
CREATE TYPE "DiscountTarget" AS ENUM ('CREDIT_TOP_UP', 'COURSE_PURCHASE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "discountAmount" INTEGER,
ADD COLUMN     "discountCampaignId" TEXT;

-- CreateTable
CREATE TABLE "DiscountCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "percentOff" INTEGER NOT NULL,
    "appliesTo" "DiscountAppliesTo" NOT NULL DEFAULT 'ALL',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxRedemptions" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" "DiscountTarget" NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "finalAmount" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCampaign_code_key" ON "DiscountCampaign"("code");

-- CreateIndex
CREATE INDEX "DiscountCampaign_isActive_startsAt_endsAt_idx" ON "DiscountCampaign"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "DiscountRedemption_campaignId_idx" ON "DiscountRedemption"("campaignId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_userId_idx" ON "DiscountRedemption"("userId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_campaignId_userId_idx" ON "DiscountRedemption"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DiscountCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

