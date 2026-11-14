import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import {
  PERSON_NAME_MESSAGE,
  PERSON_NAME_PATTERN,
} from '../../common/person-name';
import { UserRole } from '../../generated/prisma/client';
import { SELF_SIGNUP_ROLES, type SelfSignupRole } from '../auth.constants';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the user',
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @Matches(PERSON_NAME_PATTERN, { message: PERSON_NAME_MESSAGE })
  name: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'User password (at least 6 characters)',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({
    example: 'REF12345',
    description: 'Optional referral code',
  })
  @IsOptional()
  @IsString({ message: 'Referral code must be a string' })
  referralCode?: string;

  @ApiPropertyOptional({
    enum: SELF_SIGNUP_ROLES,
    default: UserRole.USER,
    description: 'Role of the user (USER or INSTRUCTOR)',
  })
  @IsOptional()
  @IsIn(SELF_SIGNUP_ROLES, { message: 'Role must be USER or INSTRUCTOR' })
  role?: SelfSignupRole;
}
