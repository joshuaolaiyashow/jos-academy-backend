import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { DurationType, TargetLevel } from '../../generated/prisma/client';

export class CreateModuleDto {
  @ApiProperty({
    example: 'Module 1: Introduction to Web Development',
    description: 'Title of the module',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module title is required' })
  title: string;

  @ApiProperty({
    example: 'Learn the fundamentals of HTML, CSS, and Modern JavaScript.',
    description: 'Description of the module',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module description is required' })
  description: string;

  @ApiProperty({
    example: 12,
    description: 'Number of lessons in this module',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lessonsCount: number;

  @ApiProperty({
    example: 4,
    description: 'Number of assignments in this module',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  assignmentsCount: number;
}

export class CreateCourseDto {
  @ApiProperty({
    example: 'Full-Stack Web Development Bootcamp',
    description: 'Name of the course',
  })
  @IsString()
  @IsNotEmpty({ message: 'Course name is required' })
  name: string;

  @ApiProperty({
    example: 'Master full-stack development with Node.js, NestJS, and React.',
    description: 'Short description of the course',
  })
  @IsString()
  @IsNotEmpty({ message: 'Short description is required' })
  shortDescription: string;

  @ApiProperty({
    example:
      'Comprehensive hands-on training covering backend APIs, database modeling with Prisma, state management, and modern frontend frameworks.',
    description: 'Full detailed description of the course',
  })
  @IsString()
  @IsNotEmpty({ message: 'Full description is required' })
  fullDescription: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Hero image file for the course (JPEG, PNG, WebP)',
  })
  @IsOptional()
  heroImage?: any;

  @ApiPropertyOptional({
    example: 'https://jos-academy.s3.us-east-1.amazonaws.com/courses/example.png',
    description: 'Hero image filename or URL (optional if uploading file)',
  })
  @IsOptional()
  @IsString()
  heroImageName?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID of the category this course belongs to',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    example: 12,
    description: 'Duration quantity (e.g., 12)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration: number;

  @ApiProperty({
    enum: DurationType,
    example: DurationType.weeks,
    description: 'Duration unit (weeks or Months)',
  })
  @IsEnum(DurationType, { message: 'durationType must be weeks or Months' })
  durationType: DurationType;

  @ApiProperty({
    enum: TargetLevel,
    example: TargetLevel.Foundation,
    description: 'Target skill level (Foundation, Intermediate, or Advanced)',
  })
  @IsEnum(TargetLevel, { message: 'targetLevel must be Foundation, Intermediate, or Advanced' })
  targetLevel: TargetLevel;

  @ApiProperty({
    example: 30,
    description: 'Maximum number of students per cohort',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxCohortSize: number;

  @ApiProperty({
    example: 150000,
    description: 'Tuition fee in local currency',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tuitionFee: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether a certificate is offered upon completion',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  certificationOffered?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether a capstone project is required',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  capstoneRequired?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether career support is included',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  careerSupportIncluded?: boolean;

  @ApiPropertyOptional({
    type: [CreateModuleDto],
    description: 'List of course modules (JSON string or object array)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateModuleDto)
  modules?: CreateModuleDto[];
}
