import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, IsNotEmpty, IsString, Length } from 'class-validator';

const EXCHANGE_CODE_HEX_LENGTH = 64;

export class OAuthExchangeDto {
  @ApiProperty({
    description:
      'Single-use code from the /auth/callback redirect after OAuth sign-in',
  })
  @IsString()
  @IsNotEmpty()
  @IsHexadecimal()
  @Length(EXCHANGE_CODE_HEX_LENGTH, EXCHANGE_CODE_HEX_LENGTH)
  code: string;
}
