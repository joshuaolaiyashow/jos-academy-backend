import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { FEEDBACK_MAX_LENGTH } from '../assignment.constants';

export class GradeSubmissionDto {
  @ApiProperty({
    example: 84,
    description: "0 up to the assignment's max score",
  })
  @IsInt()
  @Min(0)
  score: number;

  @ApiProperty({ example: 'Clear diagram.' })
  @IsString()
  @MaxLength(FEEDBACK_MAX_LENGTH)
  feedback: string;
}
