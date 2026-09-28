import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountAppliesTo } from '../../generated/prisma/client';

/** Keeps a single campaign creation to one SQL statement's worth of invite rows. */
export const MAX_CAMPAIGN_INVITEES = 1000;

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

  @ApiPropertyOptional({
    description:
      'User IDs allowed to redeem this code; omit or leave empty for a code open to anyone.',
    type: [String],
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(MAX_CAMPAIGN_INVITEES)
  eligibleUserIds?: string[];
}

// The invitee list has its own endpoint (PUT /admin/campaigns/:id/invitees),
// so it's excluded here to avoid a PATCH silently ignoring it.
export class UpdateDiscountCampaignDto extends PartialType(
  OmitType(CreateDiscountCampaignDto, ['eligibleUserIds'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetCampaignInviteesDto {
  @ApiProperty({
    description:
      'Replaces the full invitee list. Send an empty array to open the code to anyone.',
    type: [String],
  })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  @ArrayMaxSize(MAX_CAMPAIGN_INVITEES)
  userIds: string[];
}
