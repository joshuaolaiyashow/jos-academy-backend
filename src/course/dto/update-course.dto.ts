import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DurationType, TargetLevel } from '../../generated/prisma/client';

export class UpdateCourseDto {
  @ApiPropertyOptional({ example: 'Full-Stack Web Development Bootcamp' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Master full-stack development with Node.js, NestJS, and React.',
  })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'Comprehensive hands-on training...' })
  @IsOptional()
  @IsString()
  fullDescription?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'New hero image file (optional)',
  })
  @IsOptional()
  heroImage?: any;

  @ApiPropertyOptional({ example: 'https://.../courses/example.png' })
  @IsOptional()
  @IsString()
  heroImageName?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ enum: DurationType })
  @IsOptional()
  @IsEnum(DurationType, { message: 'durationType must be weeks or Months' })
  durationType?: DurationType;

  @ApiPropertyOptional({ enum: TargetLevel })
  @IsOptional()
  @IsEnum(TargetLevel, {
    message: 'targetLevel must be Foundation, Intermediate, or Advanced',
  })
  targetLevel?: TargetLevel;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxCohortSize?: number;

  @ApiPropertyOptional({ example: 150000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuitionFee?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  certificationOffered?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  capstoneRequired?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  careerSupportIncluded?: boolean;
}
