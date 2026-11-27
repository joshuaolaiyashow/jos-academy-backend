import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

import { CourseStatus, TargetLevel } from '../../generated/prisma/client';
import {
  PaginatedSearchQueryDto,
  SORT_ORDERS,
  type SortOrder,
} from '../../utils/pagination';

export const PROGRAM_SORT_FIELDS = ['name', 'tuitionFee', 'startsAt'] as const;

/** `search` matches the program name or its creator's name. */
export class ListProgramsQueryDto extends PaginatedSearchQueryDto {
  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @ApiPropertyOptional({ enum: TargetLevel })
  @IsOptional()
  @IsEnum(TargetLevel)
  targetLevel?: TargetLevel;

  @ApiPropertyOptional({ enum: PROGRAM_SORT_FIELDS })
  @IsOptional()
  @IsIn(PROGRAM_SORT_FIELDS)
  sort?: (typeof PROGRAM_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
