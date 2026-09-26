import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export const COHORT_SCHEDULE_MAX_MODULES = 100;

export class CohortModuleDateDto {
  @ApiProperty()
  @IsUUID()
  moduleId: string;

  @ApiProperty({ example: '2026-10-12T09:00:00.000Z' })
  @IsDateString()
  startsAt: string;
}

export class SetCohortModulesDto {
  @ApiProperty({ type: [CohortModuleDateDto] })
  @IsArray()
  @ArrayMaxSize(COHORT_SCHEDULE_MAX_MODULES)
  @ValidateNested({ each: true })
  @Type(() => CohortModuleDateDto)
  modules: CohortModuleDateDto[];
}
