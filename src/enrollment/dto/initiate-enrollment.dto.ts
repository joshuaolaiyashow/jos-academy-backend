import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EnrollmentType } from '../../generated/prisma/client';

export class InitiateEnrollmentDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Course ID (UUID)',
  })
  @IsString({ message: 'courseId must be a string' })
  @IsNotEmpty({ message: 'courseId is required' })
  courseId: string;

  @ApiProperty({
    enum: EnrollmentType,
    example: EnrollmentType.FULL_COURSE,
    description: 'Enrollment type: FULL_COURSE (pay full tuition) or MODULAR (pay per module)',
  })
  @IsEnum(EnrollmentType, {
    message: 'type must be either FULL_COURSE or MODULAR',
  })
  type: EnrollmentType;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'Required if type is MODULAR: The specific Module ID to unlock and pay for',
  })
  @IsOptional()
  @IsString({ message: 'moduleId must be a string' })
  moduleId?: string;
}
