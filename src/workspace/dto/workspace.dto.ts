import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import type { CourseReviewDecision } from '../../admin/dto/review-course.dto';
import { ListAuditLogsQueryDto } from '../../audit/dto/list-audit-logs-query.dto';
import { CreateDiscountCampaignDto } from '../../discount/dto/create-discount-campaign.dto';
import { MAX_SEARCH_LENGTH } from '../../utils/pagination';

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
