import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class SessionScheduleQueryDto {
  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Start of the window (inclusive), ISO 8601',
  })
  @IsISO8601({}, { message: 'from must be an ISO 8601 date' })
  from: string;

  @ApiProperty({
    example: '2026-10-01T00:00:00.000Z',
    description: 'End of the window (exclusive), ISO 8601',
  })
  @IsISO8601({}, { message: 'to must be an ISO 8601 date' })
  to: string;
}
