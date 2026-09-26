import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export type AdminUserStatus = 'active' | 'suspended';

export class UpdateUserStatusDto {
  @ApiProperty({
    enum: ['active', 'suspended'],
    example: 'suspended',
    description: 'New account status',
  })
  @IsIn(['active', 'suspended'], {
    message: 'status must be "active" or "suspended"',
  })
  status: AdminUserStatus;
}
