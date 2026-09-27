import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CourseProjectStatus } from '../../generated/prisma/client';

export class UpdateCourseProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null clears demo day' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  demoDay?: string | null;

  @ApiPropertyOptional({ enum: CourseProjectStatus })
  @IsOptional()
  @IsEnum(CourseProjectStatus)
  status?: CourseProjectStatus;
}
