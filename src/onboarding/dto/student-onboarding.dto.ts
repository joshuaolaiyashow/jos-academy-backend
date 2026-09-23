import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AcademicBackgroundType,
  EducationLevel,
  OnboardingStep,
  PracticalExperience,
} from '../../generated/prisma/client';

export class AssessmentAnswerItemDto {
  @ApiProperty({ example: 1, description: 'Question number (1 to 16)' })
  @IsInt()
  questionId: number;

  @ApiProperty({
    example: 'What is 12 + 27?',
    description: 'The assessment question text',
  })
  @IsString()
  question: string;

  @ApiProperty({
    example: '39',
    description: 'Option selected by the student',
  })
  @IsNotEmpty()
  selectedOption: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the answer is correct (optional/computed)',
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
      'Array of learning interests. Options: Robotics, AI/ML and Automation, Software Engineering, Aerospace Engineering, Cybersecurity, Other',
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
      'Practical building experience: NEVER_BUILT_ANYTHING, COMPLETED_PERSONAL_PROJECTS, PARTICIPATED_IN_COMPETITIONS, WORKED_PROFESSIONALLY, UPLOAD_WORK',
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
      'Link to portfolio, GitHub repository, or live project (optional in Step 3)',
  })
  @IsOptional()
  @IsString()
  workPortfolioUrl?: string;

  @ApiPropertyOptional({
    example: 'https://jos-academy.s3.us-east-1.amazonaws.com/portfolio/sample.pdf',
    description:
      'S3 URL of uploaded project work or document if "UPLOAD_WORK" was selected',
  })
  @IsOptional()
  @IsString()
  workAttachmentUrl?: string;

  // ==========================================
  // STEP 4 & 5: ACADEMIC BACKGROUND & ASSESSMENT
  // ==========================================
  @ApiPropertyOptional({
    enum: AcademicBackgroundType,
    example: AcademicBackgroundType.JOS_LEARNING_ASSESSMENT,
    description:
      'Academic background method: UPLOAD_ACADEMIC_RESULTS (WAEC, NECO, transcripts) or JOS_LEARNING_ASSESSMENT (take short 16-question assessment)',
  })
  @IsOptional()
  @IsEnum(AcademicBackgroundType, {
    message:
      'academicBackgroundType must be UPLOAD_ACADEMIC_RESULTS or JOS_LEARNING_ASSESSMENT',
  })
  academicBackgroundType?: AcademicBackgroundType;

  @ApiPropertyOptional({
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/academic-records/waec-result.pdf',
    description:
      'S3 URL of uploaded WAEC, NECO, NABTEB, BECE, or transcript certificate',
  })
  @IsOptional()
  @IsString()
  academicResultsUrl?: string;

  @ApiPropertyOptional({
    example: 'WAEC',
    description:
      'Type of academic certificate uploaded (e.g. WAEC, NECO, NABTEB, BECE, TRANSCRIPT, OTHER)',
  })
  @IsOptional()
  @IsString()
  academicResultsType?: string;

  @ApiPropertyOptional({
    example: 14,
    description: 'Score obtained on the JOS Learning Assessment (e.g. 14 out of 16)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(16)
  assessmentScore?: number;

  @ApiPropertyOptional({
    example: 16,
    description: 'Total number of assessment questions (default: 16)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assessmentTotal?: number;

  @ApiPropertyOptional({
    type: [AssessmentAnswerItemDto],
    description: 'Answers submitted for the JOS Learning Assessment questions',
  })
  @IsOptional()
  @IsArray()
  assessmentAnswers?: AssessmentAnswerItemDto[];

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the assessment has been completed',
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
      'Set to true when student completes the full onboarding flow',
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
