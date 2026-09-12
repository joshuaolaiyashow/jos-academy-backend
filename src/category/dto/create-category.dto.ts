import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Web Development',
    description: 'Unique name of the category',
  })
  @IsString({ message: 'Category name must be a string' })
  @IsNotEmpty({ message: 'Category name is required' })
  name: string;

  @ApiPropertyOptional({
    example:
      'Courses covering frontend, backend, fullstack development, and modern web frameworks.',
    description: 'Detailed description of the category',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;
}
