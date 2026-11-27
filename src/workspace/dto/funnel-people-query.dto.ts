import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../utils/pagination';
import { SIGNUP_FUNNEL_STEPS } from '../workspace-analytics.service';
import { ChartQueryDto } from './chart-query.dto';

/** The funnel's window, a page, and the step people dropped off before (1 = never verified their email). */
export class FunnelPeopleQueryDto extends IntersectionType(
  ChartQueryDto,
  PaginationQueryDto,
) {
  @ApiProperty({ minimum: 1, maximum: SIGNUP_FUNNEL_STEPS.length })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SIGNUP_FUNNEL_STEPS.length)
  step: number;
}
