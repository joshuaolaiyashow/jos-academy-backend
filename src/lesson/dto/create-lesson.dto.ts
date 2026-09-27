import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LessonContentType } from '../../generated/prisma/client';
import { CODE_LANGUAGES, type CodeLanguage } from '../../common/code-languages';

export class CreateLessonDto {
  @ApiProperty({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description: 'ID of the module this lesson belongs to',
  })
  @IsString()
  @IsNotEmpty({ message: 'Module ID is required' })
  moduleId: string;

  @ApiProperty({
    example: 'Introduction to Variables',
    description: 'Title of the lesson',
  })
  @IsString()
  @IsNotEmpty({ message: 'Lesson title is required' })
  title: string;

  @ApiPropertyOptional({
    example: 'Learn how variables work in JavaScript.',
    description: 'Description of the lesson',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: LessonContentType,
    example: LessonContentType.video,
    description: 'Content type of the lesson (video, note, or code)',
  })
  @IsEnum(LessonContentType, {
    message: 'contentType must be video, note, or code',
  })
  contentType: LessonContentType;

  @ApiPropertyOptional({
    example:
      'https://jos-academy.s3.us-east-1.amazonaws.com/lessons/example.mp4',
    description: 'Video URL (used when contentType is video)',
  })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({
    example: 'const greeting = "Hello, world!";',
    description: 'Text, note, or code content of the lesson',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    enum: CODE_LANGUAGES,
    example: 'javascript',
    description: 'Language of the code (used when contentType is code)',
  })
  @IsOptional()
  @IsIn(CODE_LANGUAGES, {
    message: `codeLanguage must be one of: ${CODE_LANGUAGES.join(', ')}`,
  })
  codeLanguage?: CodeLanguage;

  @ApiPropertyOptional({
    example: 15,
    description: 'Duration of the lesson in minutes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Order of the lesson within the module',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}
