import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AvailabilityType } from '../../generated/prisma/client';

export class CreateCreatorDto {
  @ApiProperty({
    example: 'Bekwa Undie',
    description: 'Full name of the creator/instructor',
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Full name is required' })
  name: string;

  @ApiProperty({
    example: 'bekwa@example.com',
    description: 'Email address of the creator/instructor',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: '+2348012345678',
    description: 'Phone number',
  })
  @IsString({ message: 'Phone must be a string' })
  @IsNotEmpty({ message: 'Phone is required' })
  phone: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'Country of residence',
  })
  @IsString({ message: 'Country must be a string' })
  @IsNotEmpty({ message: 'Country is required' })
  country: string;

  @ApiProperty({
    example: 'Data Science',
    description: 'Field of expertise',
  })
  @IsString({ message: 'Field of expertise must be a string' })
  @IsNotEmpty({ message: 'Field of expertise is required' })
  fieldOfExpertise: string;

  @ApiProperty({
    example: '5 years',
    description: 'Years or details of teaching experience',
  })
  @IsString({ message: 'Teaching experience must be a string' })
  @IsNotEmpty({ message: 'Teaching experience is required' })
  teachingExperience: string;

  @ApiProperty({
    enum: AvailabilityType,
    example: AvailabilityType.PART_TIME,
    description: 'Availability (FULL_TIME or PART_TIME)',
  })
  @IsEnum(AvailabilityType, { message: 'Availability must be FULL_TIME or PART_TIME' })
  availability: AvailabilityType;
}
