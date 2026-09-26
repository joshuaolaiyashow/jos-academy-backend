import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CohortStatus } from '../../generated/prisma/client';

export class ListCohortsQueryDto {
  @ApiPropertyOptional({ enum: CohortStatus })
  @IsOptional()
  @IsEnum(CohortStatus)
  status?: CohortStatus;
}
