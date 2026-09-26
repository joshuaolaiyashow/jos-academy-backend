import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BadgeTriggerType } from '../../generated/prisma/client';

export class CreateBadgeDto {
  @ApiProperty({ example: 'Course Conqueror' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Awarded for completing your first course' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    example: 'trophy',
    description: 'Icon name shown with the badge',
  })
  @IsString()
  @IsNotEmpty()
  icon: string;

  @ApiProperty({ enum: BadgeTriggerType })
  @IsEnum(BadgeTriggerType)
  triggerType: BadgeTriggerType;

  @ApiPropertyOptional({
    description:
      'Required for COURSE_COMPLETION: the specific course this badge is tied to',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({
    description:
      'Required for MODULE_COMPLETION: the specific module this badge is tied to',
  })
  @IsOptional()
  @IsString()
  moduleId?: string;

  @ApiPropertyOptional({
    description:
      'Required for the *_MILESTONE trigger types: how many courses completed/purchased, modules purchased, or credit purchases earns this badge',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description: 'Position in the badges list; appended last when omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBadgeDto extends PartialType(CreateBadgeDto) {}

export class AwardBadgeDto {
  @ApiProperty({ description: 'The user to manually award this badge to' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
