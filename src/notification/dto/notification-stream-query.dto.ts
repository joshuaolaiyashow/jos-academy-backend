import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class NotificationStreamQueryDto {
  @ApiProperty({
    description: 'Short-lived token from POST /notifications/stream-token',
  })
  @IsJWT()
  token: string;
}
