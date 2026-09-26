import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
/** Hard cap so no client can pull an entire table in one request. */
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number (1-indexed)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: DEFAULT_PAGE_SIZE,
    description: `Items per page (max ${MAX_PAGE_SIZE})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}

export class PaginatedSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive text search' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}

export type PageParams = Pick<PaginationQueryDto, 'page' | 'limit'>;

export type PageMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
};

export const toPrismaPage = ({
  page,
  limit,
}: PageParams): { skip: number; take: number } => ({
  skip: (page - 1) * limit,
  take: limit,
});

export const pageMeta = (
  total: number,
  { page, limit }: PageParams,
): PageMeta => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
});
