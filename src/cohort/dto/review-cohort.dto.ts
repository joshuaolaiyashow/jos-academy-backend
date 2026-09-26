import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { REVIEW_ATTACHMENTS_MAX } from '../cohort.constants';

export class ReviewCohortDto {
  @ApiProperty({ description: 'true approves; false requests changes' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    example: 'Module 2 videos are missing audio.',
    description: 'Required when requesting changes',
  })
  @ValidateIf((dto: ReviewCohortDto) => !dto.approved)
  @IsString()
  @IsNotEmpty({ message: 'Tell the creator what to change.' })
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: REVIEW_ATTACHMENTS_MAX,
    description:
      'Screenshots from POST /media/review-feedback/upload-url. Ignored on approve.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_ATTACHMENTS_MAX)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  attachmentUrls?: string[];
}
