import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferEnrollmentDto {
  @ApiProperty({ description: 'The cohort to move the learner into' })
  @IsUUID()
  cohortId: string;
}
