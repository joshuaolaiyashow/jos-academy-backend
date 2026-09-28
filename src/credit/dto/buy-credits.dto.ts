import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MIN_CREDIT_PURCHASE } from '../credit.service';

export class BuyCreditsDto {
  @ApiProperty({
    example: 100,
    description:
      'Number of credits to purchase (10 Credits = ₦100, i.e. 1 Credit = ₦10)',
    minimum: MIN_CREDIT_PURCHASE,
  })
  @Type(() => Number)
  @IsInt({ message: 'credits must be an integer' })
  @IsPositive({ message: 'credits must be a positive number' })
  @Min(MIN_CREDIT_PURCHASE, {
    message: `Minimum credit purchase is ${MIN_CREDIT_PURCHASE} credits`,
  })
  credits: number;

  @ApiPropertyOptional({
    example: 'LAUNCH20',
    description: 'Optional discount code',
  })
  @IsOptional()
  @IsString()
  discountCode?: string;
}
