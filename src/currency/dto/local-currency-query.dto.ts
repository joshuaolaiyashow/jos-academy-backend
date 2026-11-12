import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

const MAX_TIME_ZONE_LENGTH = 64;

export class LocalCurrencyQueryDto {
  @ApiProperty({
    description: 'IANA time zone reported by the visitor’s browser',
    example: 'Africa/Lagos',
  })
  @IsString()
  @MaxLength(MAX_TIME_ZONE_LENGTH)
  timeZone: string;
}
