-- Discount campaigns can be scoped to a specific list of users instead of
-- being open to anyone with the code.
ALTER TABLE "DiscountCampaign"
  ADD COLUMN "isInviteOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DiscountCampaignInvite" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DiscountCampaignInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscountCampaignInvite_campaignId_userId_key"
  ON "DiscountCampaignInvite"("campaignId", "userId");
CREATE INDEX "DiscountCampaignInvite_userId_idx"
  ON "DiscountCampaignInvite"("userId");

ALTER TABLE "DiscountCampaignInvite"
  ADD CONSTRAINT "DiscountCampaignInvite_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "DiscountCampaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DiscountCampaignInvite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
