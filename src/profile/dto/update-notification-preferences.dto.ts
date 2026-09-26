import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Email me when an assignment is graded' })
  @IsOptional()
  @IsBoolean()
  emailAssignmentGraded?: boolean;

  @ApiPropertyOptional({
    description: 'Email me when a live session is scheduled for my programs',
  })
  @IsOptional()
  @IsBoolean()
  emailLiveSessions?: boolean;
}
