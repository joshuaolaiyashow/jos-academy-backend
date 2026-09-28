import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_HEARTBEAT_SECONDS, MAX_VIDEO_SECONDS } from '../lesson-engagement';

export class RecordEngagementDto {
  @ApiProperty({
    example: 15,
    description: 'Seconds actually watched/read since the last heartbeat',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_HEARTBEAT_SECONDS)
  seconds: number;

  @ApiPropertyOptional({
    example: 754,
    description: "The video's real length, as the player reports it",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_SECONDS)
  videoDurationSeconds?: number;
}
