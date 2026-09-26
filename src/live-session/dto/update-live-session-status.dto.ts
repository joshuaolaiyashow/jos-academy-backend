import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LiveSessionStatus } from '../../generated/prisma/client';

export class UpdateLiveSessionStatusDto {
  @ApiProperty({
    enum: LiveSessionStatus,
    example: LiveSessionStatus.LIVE,
    description: 'New status for the live session',
  })
  @IsEnum(LiveSessionStatus, {
    message: 'status must be SCHEDULED, LIVE, ENDED, or CANCELLED',
  })
  status: LiveSessionStatus;
}
