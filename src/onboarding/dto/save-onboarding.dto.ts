import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ACADEMIC_RECORD_TYPES } from '../academic-document';
import {
  AcademicBackgroundType,
  EducationLevel,
  PracticalExperience,
} from '../../generated/prisma/client';

const MAX_INTERESTS = 20;
const MAX_TEXT_LENGTH = 200;
const MAX_ACADEMIC_DOCUMENTS = 20;
const FILE_NAME_MAX_LENGTH = 255;
const FILE_KEY_MAX_LENGTH = 512;

/** One uploaded result: the image must come from POST /onboarding/academic-documents. */
export class AcademicDocumentDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: ACADEMIC_RECORD_TYPES })
  @IsIn(ACADEMIC_RECORD_TYPES)
  type: (typeof ACADEMIC_RECORD_TYPES)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(FILE_NAME_MAX_LENGTH)
  fileName: string;

  @ApiProperty({ description: 'The key returned by the upload endpoint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FILE_KEY_MAX_LENGTH)
  fileKey: string;
}

export class SaveOnboardingDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INTERESTS)
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  otherInterest?: string;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  otherEducationLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  institutionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  currentClassOrLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  expectedGraduationYear?: string;

  @ApiPropertyOptional({ enum: PracticalExperience })
  @IsOptional()
  @IsEnum(PracticalExperience)
  practicalExperience?: PracticalExperience;

  @ApiPropertyOptional({
    description: 'Work samples: [{ id, type, label, url }]',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INTERESTS)
  workSamples?: Record<string, unknown>[];

  @ApiPropertyOptional({ enum: AcademicBackgroundType })
  @IsOptional()
  @IsEnum(AcademicBackgroundType)
  academicBackgroundType?: AcademicBackgroundType;

  @ApiPropertyOptional({ type: [AcademicDocumentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACADEMIC_DOCUMENTS)
  @ValidateNested({ each: true })
  @Type(() => AcademicDocumentDto)
  academicDocuments?: AcademicDocumentDto[];

  @ApiPropertyOptional({
    description: 'Assessment answers: [{ questionId, selectedOptionId }]',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  assessmentAnswers?: Record<string, unknown>[];
}
