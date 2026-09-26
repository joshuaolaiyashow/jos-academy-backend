-- Backfill: lessonsCount is now enforced as each module's lesson plan (no adding past
-- it, exact match to submit for review). Modules added after program creation were
-- stored with 0, so raise any plan below the lessons a module already holds to that
-- real count; otherwise those modules could never take another lesson or pass review.
UPDATE "Modules" AS m
SET "lessonsCount" = counted.total
FROM (
  SELECT "moduleId", COUNT(*)::int AS total
  FROM "Lesson"
  GROUP BY "moduleId"
) AS counted
WHERE m.id = counted."moduleId"
  AND m."lessonsCount" < counted.total;
