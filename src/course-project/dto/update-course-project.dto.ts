import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
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

  @ApiPropertyOptional({ enum: CourseProjectStatus })
  @IsOptional()
  @IsEnum(CourseProjectStatus)
  status?: CourseProjectStatus;
}
