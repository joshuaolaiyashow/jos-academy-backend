import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountTarget } from '../../generated/prisma/client';

export class ValidateDiscountDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty({ message: 'Discount code is required' })
  code: string;

  @ApiProperty({ enum: DiscountTarget, example: DiscountTarget.CREDIT_TOP_UP })
  @IsEnum(DiscountTarget)
  target: DiscountTarget;

  @ApiProperty({
    example: 1000,
    description:
      'Price before discount: USD for CREDIT_TOP_UP, credits for COURSE_PURCHASE',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;
}
