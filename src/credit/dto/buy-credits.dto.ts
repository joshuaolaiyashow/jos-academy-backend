import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BuyCreditsDto {
  @ApiProperty({
    example: 100,
    description:
      'Number of credits to purchase (10 Credits = ₦100, i.e. 1 Credit = ₦10)',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'credits must be an integer' })
  @IsPositive({ message: 'credits must be a positive number' })
  @Min(1, { message: 'Minimum credit purchase is 1 credit' })
  credits: number;
}
