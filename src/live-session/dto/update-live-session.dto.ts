import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import {
  MEETING_LINK_MAX_LENGTH,
  MEETING_LINK_URL_OPTIONS,
} from './create-live-session.dto';

export class UpdateLiveSessionDto {
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

  @ApiPropertyOptional({
    example: 'https://youtu.be/abc123',
    nullable: true,
    description: 'Recording learners can rewatch (https only); null removes it',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl(MEETING_LINK_URL_OPTIONS, {
    message: 'recordingUrl must be a valid https:// link',
  })
  @MaxLength(MEETING_LINK_MAX_LENGTH)
  recordingUrl?: string | null;
}
