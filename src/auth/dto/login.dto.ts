import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { CLIENT_TYPES, type ClientType } from '../auth.constants';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'User password',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiPropertyOptional({
    enum: CLIENT_TYPES,
    description:
      'The mobile app sends "mobile" for a 30-day refresh token; web defaults to 7 days',
  })
  @IsOptional()
  @IsIn(CLIENT_TYPES)
  clientType?: ClientType;
}
