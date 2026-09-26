import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional, ValidateIf } from 'class-validator';
import { CreateCohortDto } from './create-cohort.dto';

export class UpdateCohortDto extends PartialType(
  OmitType(CreateCohortDto, ['courseId', 'demoDayAt'] as const),
) {
  @ApiPropertyOptional({ nullable: true, description: 'null clears demo day' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  demoDayAt?: string | null;
}
