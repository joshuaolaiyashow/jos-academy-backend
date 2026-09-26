import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../utils/pagination';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: true,
    description: 'When true, only return unread notifications',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}
