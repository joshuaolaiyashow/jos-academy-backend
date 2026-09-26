import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ANSWER_TEXT_MAX_LENGTH,
  MAX_ASSIGNMENT_QUESTIONS,
  SUBMISSION_NOTES_MAX_LENGTH,
} from '../assignment.constants';

export class AssignmentAnswerDto {
  @ApiProperty({ example: 'q1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  questionId: string;

  @ApiPropertyOptional({ description: 'Short or long response' })
  @IsOptional()
  @IsString()
  @MaxLength(ANSWER_TEXT_MAX_LENGTH)
  text?: string;

  @ApiPropertyOptional({ description: 'Chosen option for Multiple choice' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  choice?: string;

  @ApiPropertyOptional({
    description: 'Key returned by POST /assignments/:id/files',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class SubmitAssignmentDto {
  @ApiProperty({ type: [AssignmentAnswerDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ASSIGNMENT_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => AssignmentAnswerDto)
  answers: AssignmentAnswerDto[];

  @ApiPropertyOptional({ description: 'Notes to the instructor' })
  @IsOptional()
  @IsString()
  @MaxLength(SUBMISSION_NOTES_MAX_LENGTH)
  notes?: string;
}
