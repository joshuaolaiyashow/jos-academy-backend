-- JOS Workspace broadcasts leave out users who unsubscribed from marketing mail.
ALTER TABLE "User"
  ADD COLUMN "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketingOptOutAt" TIMESTAMP(3);
