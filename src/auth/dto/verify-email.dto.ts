import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
    description: 'Verification token received in the verification email link',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}
