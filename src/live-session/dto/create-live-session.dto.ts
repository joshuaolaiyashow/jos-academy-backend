import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionPlatform, SessionType } from '../../generated/prisma/client';

export const MEETING_LINK_MAX_LENGTH = 500;
// Learners open this link directly, so only real https URLs are accepted.
export const MEETING_LINK_URL_OPTIONS = {
  protocols: ['https'],
  require_protocol: true,
};

export class CreateLiveSessionDto {
  @ApiProperty({
    example: 'Intro to React Hooks',
    description: 'Title of the live session',
  })
  @IsString()
  @IsNotEmpty({ message: 'Session title is required' })
  title: string;

  @ApiProperty({
    enum: SessionType,
    example: SessionType.Lecture,
    description: 'Type of live session',
  })
  @IsEnum(SessionType, { message: 'type must be Lecture, Workshop, or QandA' })
  type: SessionType;

  @ApiProperty({
    enum: SessionPlatform,
    example: SessionPlatform.Zoom,
    description: 'Platform the session will be hosted on',
  })
  @IsEnum(SessionPlatform, {
    message: 'platform must be Zoom, GoogleMeet, or MicrosoftTeams',
  })
  platform: SessionPlatform;

  @ApiPropertyOptional({
    example: 'https://zoom.us/j/1234567890',
    description: 'Meeting link for the live session (https only)',
  })
  @IsOptional()
  @IsUrl(MEETING_LINK_URL_OPTIONS, {
    message: 'meetingLink must be a valid https:// link',
  })
  @MaxLength(MEETING_LINK_MAX_LENGTH)
  meetingLink?: string;

  @ApiProperty({
    example: '2026-10-01T14:00:00.000Z',
    description: 'Scheduled start date and time (ISO 8601)',
  })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({
    example: 60,
    description: 'Duration of the session in minutes',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMins: number;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID of the course this session belongs to',
  })
  @IsString()
  @IsNotEmpty({ message: 'courseId is required' })
  courseId: string;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description:
      'ID of the module this session belongs to (must belong to courseId)',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;
}
