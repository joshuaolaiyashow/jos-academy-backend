import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const REVIEW_ATTACHMENTS_MAX = 5;

export type CourseReviewDecision = 'ACTIVE' | 'REJECTED';

export class ReviewCourseDto {
  @ApiProperty({ enum: ['ACTIVE', 'REJECTED'], example: 'ACTIVE' })
  @IsIn(['ACTIVE', 'REJECTED'], {
    message: 'status must be ACTIVE or REJECTED',
  })
  status: CourseReviewDecision;

  @ApiPropertyOptional({ example: 'Module 2 videos are missing audio.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: REVIEW_ATTACHMENTS_MAX,
    description:
      'Screenshots for the creator, uploaded via POST /media/review-feedback/upload-url. Ignored on approve.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_ATTACHMENTS_MAX)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  attachmentUrls?: string[];
}
