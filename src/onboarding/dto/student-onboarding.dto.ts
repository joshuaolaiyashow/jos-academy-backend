import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AcademicBackgroundType,
  EducationLevel,
  OnboardingStep,
  PracticalExperience,
} from '../../generated/prisma/client';

export class AcademicDocumentItemDto {
  @ApiProperty({
    example: 'WAEC',
    description:
      'Document / certificate type (e.g. WAEC, NECO, NABTEB, BECE, TRANSCRIPT, OTHER)',
  })
  @IsString()
  @IsNotEmpty()
  documentType: string;

  @ApiProperty({
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/1727100000000-uuid-waec.pdf',
    description: 'S3 URL of the uploaded document',
  })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional({
    example: 'waec_result_2025.pdf',
    description: 'Original file name',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({
    example: 245800,
    description: 'File size in bytes',
  })
  @IsOptional()
  @IsInt()
  fileSize?: number;
}

export class AssessmentAnswerItemDto {
  @ApiPropertyOptional({ example: 1, description: 'Question ID or index' })
  @IsOptional()
  questionId?: number | string;

  @ApiPropertyOptional({
    example: 'What is 12 + 27?',
    description: 'Question text',
  })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({
    example: '39',
    description: 'Option selected by the student',
  })
  @IsOptional()
  selectedOption?: any;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the answer is correct (managed by frontend)',
  })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class SaveStudentOnboardingDto {
  // ==========================================
  // STEP 1: INTERESTS
  // ==========================================
  @ApiPropertyOptional({
    example: ['Software Engineering', 'AI/ML and Automation', 'Robotics'],
    description:
      'Array of learning interests: Robotics, AI/ML and Automation, Software Engineering, Aerospace Engineering, Cybersecurity, Other',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'interests must be an array of strings' })
  @IsString({ each: true, message: 'each interest must be a string' })
  interests?: string[];

  @ApiPropertyOptional({
    example: 'Quantum Computing',
    description: 'Custom interest text if "Other" was selected in Step 1',
  })
  @IsOptional()
  @IsString()
  otherInterest?: string;

  // ==========================================
  // STEP 2: EDUCATION
  // ==========================================
  @ApiPropertyOptional({
    enum: EducationLevel,
    example: EducationLevel.UNIVERSITY,
    description:
      'Current educational level: JUNIOR_SECONDARY_SCHOOL, SENIOR_SECONDARY_SCHOOL, POLYTECHNIC, UNIVERSITY, GRADUATE, WORKING_PROFESSIONAL, OTHER',
  })
  @IsOptional()
  @IsEnum(EducationLevel, {
    message:
      'educationLevel must be one of: JUNIOR_SECONDARY_SCHOOL, SENIOR_SECONDARY_SCHOOL, POLYTECHNIC, UNIVERSITY, GRADUATE, WORKING_PROFESSIONAL, OTHER',
  })
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({
    example: 'Vocational Training Center',
    description:
      'Custom education level description if "OTHER" was selected in Step 2',
  })
  @IsOptional()
  @IsString()
  otherEducationLevel?: string;

  // ==========================================
  // STEP 3: PRACTICAL EXPERIENCE
  // ==========================================
  @ApiPropertyOptional({
    enum: PracticalExperience,
    example: PracticalExperience.COMPLETED_PERSONAL_PROJECTS,
    description:
      'Practical experience: NEVER_BUILT_ANYTHING, COMPLETED_PERSONAL_PROJECTS, PARTICIPATED_IN_COMPETITIONS, WORKED_PROFESSIONALLY, UPLOAD_WORK',
  })
  @IsOptional()
  @IsEnum(PracticalExperience, {
    message:
      'practicalExperience must be one of: NEVER_BUILT_ANYTHING, COMPLETED_PERSONAL_PROJECTS, PARTICIPATED_IN_COMPETITIONS, WORKED_PROFESSIONALLY, UPLOAD_WORK',
  })
  practicalExperience?: PracticalExperience;

  @ApiPropertyOptional({
    example: 'https://github.com/johndoe/my-robotics-project',
    description:
      'Link to portfolio, GitHub repository, or live project (Step 3)',
  })
  @IsOptional()
  @IsString()
  workPortfolioUrl?: string;

  @ApiPropertyOptional({
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/student-portfolios/sample-project.pdf',
    description:
      'S3 URL of uploaded project work if "UPLOAD_WORK" was selected',
  })
  @IsOptional()
  @IsString()
  workAttachmentUrl?: string;

  // ==========================================
  // STEP 4 & 5: ACADEMIC BACKGROUND & ASSESSMENT
  // ==========================================
  @ApiPropertyOptional({
    enum: AcademicBackgroundType,
    example: AcademicBackgroundType.UPLOAD_ACADEMIC_RESULTS,
    description:
      'Academic background method: UPLOAD_ACADEMIC_RESULTS (upload records) or JOS_LEARNING_ASSESSMENT (take frontend assessment)',
  })
  @IsOptional()
  @IsEnum(AcademicBackgroundType, {
    message:
      'academicBackgroundType must be UPLOAD_ACADEMIC_RESULTS or JOS_LEARNING_ASSESSMENT',
  })
  academicBackgroundType?: AcademicBackgroundType;

  @ApiPropertyOptional({
    type: [AcademicDocumentItemDto],
    description:
      'List of uploaded academic documents (e.g. WAEC, NECO, NABTEB, BECE, transcripts). Can upload multiple documents.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcademicDocumentItemDto)
  academicDocuments?: AcademicDocumentItemDto[];

  @ApiPropertyOptional({
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/student-academic-results/waec-result.pdf',
    description: 'Primary academic result S3 URL (if single file provided)',
  })
  @IsOptional()
  @IsString()
  academicResultsUrl?: string;

  @ApiPropertyOptional({
    example: 'WAEC',
    description: 'Primary academic result certificate type (e.g. WAEC, NECO)',
  })
  @IsOptional()
  @IsString()
  academicResultsType?: string;

  @ApiPropertyOptional({
    example: 14,
    description:
      'Assessment score achieved on the frontend quiz (e.g. 14 out of 16)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assessmentScore?: number;

  @ApiPropertyOptional({
    example: 16,
    description: 'Total number of assessment questions configured on frontend',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assessmentTotal?: number;

  @ApiPropertyOptional({
    type: [AssessmentAnswerItemDto],
    description:
      'Array of answers/questions submitted from the frontend assessment',
  })
  @IsOptional()
  @IsArray()
  assessmentAnswers?: any[];

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the assessment has been completed on frontend',
  })
  @IsOptional()
  @IsBoolean()
  assessmentCompleted?: boolean;

  // ==========================================
  // ONBOARDING PROGRESS & STATUS
  // ==========================================
  @ApiPropertyOptional({
    enum: OnboardingStep,
    example: OnboardingStep.DONE,
    description:
      'Current step in onboarding flow: INTERESTS, EDUCATION, EXPERIENCE, BACKGROUND, DONE',
  })
  @IsOptional()
  @IsEnum(OnboardingStep)
  currentStep?: OnboardingStep;

  @ApiPropertyOptional({
    example: true,
    description:
      'Set to true when student completes the onboarding flow',
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class UploadAcademicDocumentDto {
  @ApiProperty({
    example: 'WAEC',
    description:
      'Document type selected by user: "WAEC", "NECO", "NABTEB", "BECE", "TRANSCRIPT", "OTHER", or "PORTFOLIO"',
  })
  @IsString()
  @IsNotEmpty()
  documentType: string;
}
