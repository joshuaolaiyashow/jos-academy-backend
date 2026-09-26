import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
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
}
