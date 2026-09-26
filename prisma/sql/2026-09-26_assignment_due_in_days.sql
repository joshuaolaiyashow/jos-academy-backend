-- AlterTable: assignment deadlines become per learner ("N days after buying the module").
-- Additive only. The old fixed "dueDate" column stays in place but is no longer read,
-- so existing assignments simply have no deadline until the creator sets one.
ALTER TABLE "Assignments" ADD COLUMN IF NOT EXISTS "dueInDays" INTEGER;
