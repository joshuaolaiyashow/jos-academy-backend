import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import type { CourseReviewDecision } from '../../admin/dto/review-course.dto';
import { ListAuditLogsQueryDto } from '../../audit/dto/list-audit-logs-query.dto';
import { CreateDiscountCampaignDto } from '../../discount/dto/create-discount-campaign.dto';
import {
  MAX_SEARCH_LENGTH,
  PaginatedSearchQueryDto,
  SORT_ORDERS,
  type SortOrder,
} from '../../utils/pagination';

// Query strings arrive as text; anything but "true"/"false" is left for @IsBoolean to reject.
const toQueryBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Students and creators: the workspace's Suspended filter. */
export class WorkspaceAccountsQueryDto extends PaginatedSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  isSuspended?: boolean;
}

export const CAMPAIGN_SORT_FIELDS = [
  'name',
  'startsAt',
  'endsAt',
  'percentOff',
] as const;

export class WorkspaceCampaignsQueryDto extends PaginatedSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: CAMPAIGN_SORT_FIELDS })
  @IsOptional()
  @IsIn(CAMPAIGN_SORT_FIELDS)
  sort?: (typeof CAMPAIGN_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}

const REVIEW_DECISIONS: CourseReviewDecision[] = ['ACTIVE', 'REJECTED'];
const REJECTION_REASON_MAX_LENGTH = 1000;

/** The workspace edits a program's review decision as a plain update of `status` + `rejectionReason`. */
export class WorkspaceProgramReviewDto {
  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn(REVIEW_DECISIONS, { message: 'status must be ACTIVE or REJECTED' })
  status: CourseReviewDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(REJECTION_REASON_MAX_LENGTH)
  rejectionReason?: string;
}

/** The workspace form sends `isActive` on create too; the legacy create endpoint has no such field. */
export class WorkspaceCreateCampaignDto extends CreateDiscountCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** The workspace always may send `search`; the audit log has no text search, so it is accepted and ignored. */
export class WorkspaceAuditLogQueryDto extends ListAuditLogsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}

const ASSESSMENT_OPTIONS_MIN = 2;
const ASSESSMENT_OPTIONS_MAX = 6;

/** The workspace edits answer choices as plain text, one per line; ids are given by position (a, b, c…), as in the Academy admin. */
export class WorkspaceCreateAssessmentQuestionDto {
  @ApiProperty({ example: 'mathematics' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: 'What is 12 + 27?' })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({ type: [String], example: ['39', '40'] })
  @IsArray()
  @ArrayMinSize(ASSESSMENT_OPTIONS_MIN, {
    message: `Add at least ${ASSESSMENT_OPTIONS_MIN} answers`,
  })
  @ArrayMaxSize(ASSESSMENT_OPTIONS_MAX, {
    message: `No more than ${ASSESSMENT_OPTIONS_MAX} answers`,
  })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  options: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WorkspaceUpdateAssessmentQuestionDto extends PartialType(
  WorkspaceCreateAssessmentQuestionDto,
) {}
