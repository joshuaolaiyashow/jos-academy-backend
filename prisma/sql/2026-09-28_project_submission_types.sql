-- Projects: drop demo day, add per-project submission type, allow file uploads.
CREATE TYPE "ProjectSubmissionType" AS ENUM ('RECORDING', 'CODE', 'DOCUMENT');

ALTER TABLE "CourseProject"
  DROP COLUMN "demoDay",
  ADD COLUMN "submissionType" "ProjectSubmissionType" NOT NULL DEFAULT 'CODE';

ALTER TABLE "ProjectMilestoneSubmission"
  ALTER COLUMN "url" DROP NOT NULL,
  ADD COLUMN "fileUrl" TEXT,
  ADD COLUMN "fileName" TEXT;
