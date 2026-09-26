import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const DISCUSSION_BODY_MAX_LENGTH = 2_000;

export class CreateDiscussionDto {
  @ApiProperty({
    example: "How do sensors communicate with the robot's processor?",
    description: 'Question or reply text (plain text).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Write something before posting' })
  @MaxLength(DISCUSSION_BODY_MAX_LENGTH, {
    message: `Posts can be at most ${DISCUSSION_BODY_MAX_LENGTH} characters`,
  })
  body: string;

  @ApiPropertyOptional({
    description: 'Thread (or reply) being replied to. Omit to start a thread.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
