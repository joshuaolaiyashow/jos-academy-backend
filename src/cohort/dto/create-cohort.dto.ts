import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COHORT_NAME_MAX_LENGTH,
  COHORT_SEAT_CAP_MAX,
} from '../cohort.constants';

export class CreateCohortDto {
  @ApiProperty()
  @IsUUID()
  courseId: string;

  @ApiProperty({ example: 'October 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(COHORT_NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({ example: '2026-10-12T09:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({
    example: '2026-10-19T23:59:00.000Z',
    description: 'No new seats after this until the cohort ends',
  })
  @IsDateString()
  enrollmentClosesAt: string;

  @ApiProperty({ example: '2026-12-18T17:00:00.000Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({
    description: "Defaults to the program's maxCohortSize",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(COHORT_SEAT_CAP_MAX)
  seatCap?: number;

  @ApiPropertyOptional({ example: '2026-12-18T15:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  demoDayAt?: string;
}
