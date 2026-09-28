import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionType } from '../../generated/prisma/client';

const RECORDING_URL_MAX_LENGTH = 500;
// Learners open this link directly, so only real https URLs are accepted.
const RECORDING_URL_OPTIONS = { protocols: ['https'], require_protocol: true };

/** Schedule fields can only change while the session hasn't started; the recording link any time. */
export class UpdateLiveSessionDto {
  @ApiPropertyOptional({ example: 'Intro to React Hooks' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Session title is required' })
  title?: string;

  @ApiPropertyOptional({ enum: SessionType })
  @IsOptional()
  @IsEnum(SessionType, { message: 'type must be Lecture, Workshop, or QandA' })
  type?: SessionType;

  @ApiPropertyOptional({
    example: '2026-10-01T14:00:00.000Z',
    description: 'New start time (ISO 8601); must be in the future',
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMins?: number;

  @ApiPropertyOptional({
    example: 'https://youtu.be/abc123',
    nullable: true,
    description: 'Recording learners can rewatch (https only); null removes it',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(RECORDING_URL_OPTIONS, {
    message: 'recordingUrl must be a valid https:// link',
  })
  @MaxLength(RECORDING_URL_MAX_LENGTH)
  recordingUrl?: string | null;
}
