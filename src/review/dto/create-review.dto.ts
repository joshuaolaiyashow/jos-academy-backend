import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'Course ID being reviewed',
  })
  @IsString()
  @IsNotEmpty({ message: 'Course ID is required' })
  courseId: string;

  @ApiProperty({ example: 5, description: 'Rating from 1 to 5' })
  @IsInt({ message: 'Rating must be a whole number' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating: number;

  @ApiPropertyOptional({
    example: 'Loved the hands-on projects!',
    description: 'Optional written review',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}
