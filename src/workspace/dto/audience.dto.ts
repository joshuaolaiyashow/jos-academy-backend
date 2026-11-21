import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MAX_SEARCH_LENGTH } from '../../utils/pagination';

export const DEFAULT_AUDIENCE_PAGE_SIZE = 100;
export const MAX_AUDIENCE_PAGE_SIZE = 500;
const MAX_ID_LENGTH = 64;

const trimToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class AudienceQueryDto {
  @ApiPropertyOptional({ description: 'nextCursor from the previous page' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ example: DEFAULT_AUDIENCE_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIENCE_PAGE_SIZE)
  limit: number = DEFAULT_AUDIENCE_PAGE_SIZE;

  @ApiPropertyOptional({
    description: 'Case-insensitive match on email or name',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Service announcements: include users who opted out of marketing',
  })
  @IsOptional()
  // Query strings arrive as text; anything but "true"/"false" is left for @IsBoolean to reject.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeOptedOut: boolean = false;
}

export class StudentAudienceQueryDto extends AudienceQueryDto {
  @ApiPropertyOptional({ description: 'Program (cohort) id' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  program?: string;
}

export class AudienceUnsubscribeDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email: string;
}
