-- AlterEnum: an admin has started reviewing; the creator is locked out until rejection.
ALTER TYPE "CourseStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW' BEFORE 'ACTIVE';

-- AlterTable: creators can now reorder modules.
ALTER TABLE "Modules" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: number each course's modules in their current physical order, which
-- is the order learners see today (no ORDER BY was applied before this column).
UPDATE "Modules" AS m
SET "order" = numbered.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY ctid) - 1 AS position
  FROM "Modules"
) AS numbered
WHERE m.id = numbered.id;
