import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ASSIGNMENT_RESPONSE_TYPES,
  MAX_ASSIGNMENT_QUESTIONS,
  MAX_ASSIGNMENT_SCORE,
} from '../assignment.constants';
import type { AssignmentResponseType } from '../assignment.constants';

export class AssignmentQuestionDto {
  @ApiProperty({
    example: 'q1',
    description: 'Stable id, unique within the assignment',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id: string;

  @ApiProperty({ example: 'Name the two I2C lines' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question: string;

  @ApiProperty({ enum: ASSIGNMENT_RESPONSE_TYPES })
  @IsIn(ASSIGNMENT_RESPONSE_TYPES)
  responseType: AssignmentResponseType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required for Multiple choice',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  options?: string[];
}

export class CreateAssignmentDto {
  @ApiProperty()
  @IsUUID()
  moduleId: string;

  @ApiProperty({ example: 'Sensor wiring' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Wire an I2C sensor and explain it.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  description: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  @Max(MAX_ASSIGNMENT_SCORE)
  maxScore: number;

  @ApiProperty({ type: [AssignmentQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ASSIGNMENT_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => AssignmentQuestionDto)
  questions: AssignmentQuestionDto[];

  @ApiPropertyOptional({
    description: 'Publish immediately instead of saving a draft',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
