-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE';
