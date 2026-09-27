import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const MAX_PROJECT_MILESTONES = 10;

export class CreateCourseProjectDto {
  @ApiProperty()
  @IsUUID()
  courseId: string;

  @ApiProperty({ example: 'Line-following robot' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Build a robot that follows a line.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description: string;

  @ApiProperty({
    type: [String],
    example: ['Design doc', 'Prototype', 'Final build'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PROJECT_MILESTONES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  milestones: string[];

  @ApiPropertyOptional({
    example: '2026-12-18T15:00:00.000Z',
    description: 'When learners present the finished project',
  })
  @IsOptional()
  @IsDateString()
  demoDay?: string;
}
