import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountAppliesTo } from '../../generated/prisma/client';

export class CreateDiscountCampaignDto {
  @ApiProperty({ example: 'Launch week' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'LAUNCH20' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,32}$/, {
    message: 'code must be 3-32 letters, numbers, dashes or underscores',
  })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 20, minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff: number;

  @ApiProperty({ enum: DiscountAppliesTo, example: DiscountAppliesTo.ALL })
  @IsEnum(DiscountAppliesTo)
  appliesTo: DiscountAppliesTo;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({
    description: 'Total redemptions allowed; omit for unlimited',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;
}

export class UpdateDiscountCampaignDto extends PartialType(
  CreateDiscountCampaignDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
