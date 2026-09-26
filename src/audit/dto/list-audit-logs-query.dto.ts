import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { PaginationQueryDto } from '../../utils/pagination';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit-actions';

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(AUDIT_ACTIONS) })
  @IsOptional()
  @IsIn(Object.values(AUDIT_ACTIONS))
  action?: string;

  @ApiPropertyOptional({ description: 'Only entries by this user' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: Object.values(AUDIT_TARGETS) })
  @IsOptional()
  @IsIn(Object.values(AUDIT_TARGETS))
  targetType?: string;

  @ApiPropertyOptional({ description: 'Only entries about this record' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
