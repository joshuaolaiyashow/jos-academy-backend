import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsIn } from 'class-validator';

import { CHART_INTERVALS, type ChartInterval } from '../chart-window';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Anything but YYYY-MM-DD becomes an Invalid Date, which @IsDate rejects with a 400.
const toUtcDay = ({ value }: { value: unknown }): Date =>
  typeof value === 'string' && ISO_DATE.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(Number.NaN);

/** ?from=&to=&interval= that every Overview chart takes; `to` is exclusive. */
export class ChartQueryDto {
  @ApiProperty({ example: '2026-11-01' })
  @Transform(toUtcDay)
  @IsDate({ message: 'from must be a YYYY-MM-DD date' })
  from: Date;

  @ApiProperty({ example: '2026-12-01' })
  @Transform(toUtcDay)
  @IsDate({ message: 'to must be a YYYY-MM-DD date' })
  to: Date;

  @ApiProperty({ enum: CHART_INTERVALS })
  @IsIn(CHART_INTERVALS, { message: 'interval must be day or month' })
  interval: ChartInterval;
}
