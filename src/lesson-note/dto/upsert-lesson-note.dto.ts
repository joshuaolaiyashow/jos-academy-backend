import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export const LESSON_NOTE_MAX_LENGTH = 20_000;

export class UpsertLessonNoteDto {
  @ApiProperty({
    example: 'Sensors talk to the processor over I2C or SPI.',
    description: 'Full note text for this lesson. An empty string clears it.',
  })
  @IsString()
  @MaxLength(LESSON_NOTE_MAX_LENGTH, {
    message: `Notes can be at most ${LESSON_NOTE_MAX_LENGTH} characters`,
  })
  content: string;
}
