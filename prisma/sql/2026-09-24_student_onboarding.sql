
-- CreateEnum
CREATE TYPE "AcademicBackgroundType" AS ENUM ('UPLOAD_ACADEMIC_RESULTS', 'JOS_LEARNING_ASSESSMENT');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('JUNIOR_SECONDARY_SCHOOL', 'SENIOR_SECONDARY_SCHOOL', 'POLYTECHNIC', 'UNIVERSITY', 'GRADUATE', 'WORKING_PROFESSIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('INTERESTS', 'EDUCATION', 'EXPERIENCE', 'BACKGROUND', 'DONE');

-- CreateEnum
CREATE TYPE "PracticalExperience" AS ENUM ('NEVER_BUILT_ANYTHING', 'COMPLETED_PERSONAL_PROJECTS', 'PARTICIPATED_IN_COMPETITIONS', 'WORKED_PROFESSIONALLY', 'UPLOAD_WORK');

-- CreateTable
CREATE TABLE "StudentOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otherInterest" TEXT,
    "educationLevel" "EducationLevel",
    "otherEducationLevel" TEXT,
    "institutionName" TEXT,
    "currentClassOrLevel" TEXT,
    "expectedGraduationYear" TEXT,
    "practicalExperience" "PracticalExperience",
    "workPortfolioUrl" TEXT,
    "workAttachmentUrl" TEXT,
    "workSamples" JSONB,
    "academicBackgroundType" "AcademicBackgroundType",
    "academicResultsUrl" TEXT,
    "academicResultsType" TEXT,
    "academicDocuments" JSONB,
    "assessmentScore" INTEGER,
    "assessmentTotal" INTEGER DEFAULT 16,
    "assessmentAnswers" JSONB,
    "assessmentCompleted" BOOLEAN NOT NULL DEFAULT false,
    "currentStep" "OnboardingStep" NOT NULL DEFAULT 'INTERESTS',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentOnboarding_userId_key" ON "StudentOnboarding"("userId");

-- CreateIndex
CREATE INDEX "StudentOnboarding_userId_idx" ON "StudentOnboarding"("userId");

-- AddForeignKey
ALTER TABLE "StudentOnboarding" ADD CONSTRAINT "StudentOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

