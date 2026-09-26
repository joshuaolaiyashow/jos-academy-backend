import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AttendanceStatus } from '../../generated/prisma/client';

export class MarkAttendanceDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID of the learner whose attendance is being marked',
  })
  @IsString()
  @IsNotEmpty({ message: 'userId is required' })
  userId: string;

  @ApiProperty({
    enum: AttendanceStatus,
    example: AttendanceStatus.ATTENDED,
    description: 'Attendance status for the learner',
  })
  @IsEnum(AttendanceStatus, {
    message: 'status must be REGISTERED, ATTENDED, or MISSED',
  })
  status: AttendanceStatus;

  @ApiPropertyOptional({
    example: '2026-10-01T14:02:00.000Z',
    description: 'Time the learner joined the session (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @ApiPropertyOptional({
    example: '2026-10-01T14:58:00.000Z',
    description: 'Time the learner left the session (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  leftAt?: string;
}
