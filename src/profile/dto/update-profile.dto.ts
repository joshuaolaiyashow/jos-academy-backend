import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AvailabilityType } from '../../generated/prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe', description: 'Full name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Nigeria',
    description: 'Country of residence',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    example: 'Full-stack developer and mentor.',
    description: 'Short user bio',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    example: 'Frontend Development',
    description: 'Field of expertise',
  })
  @IsOptional()
  @IsString()
  fieldOfExpertise?: string;

  @ApiPropertyOptional({
    example: '5 years',
    description: 'Teaching experience',
  })
  @IsOptional()
  @IsString()
  teachingExperience?: string;

  @ApiPropertyOptional({
    enum: AvailabilityType,
    example: AvailabilityType.PART_TIME,
    description: 'Availability type',
  })
  @IsOptional()
  @IsEnum(AvailabilityType, {
    message: 'availability must be FULL_TIME or PART_TIME',
  })
  availability?: AvailabilityType;
}
