import { NotFoundException } from '@nestjs/common';

import { PaginatedSearchQueryDto, type SortOrder } from '../utils/pagination';

export type WorkspaceMeta = { total: number; page: number; limit: number };
export type WorkspacePage<T> = { data: T[]; meta: WorkspaceMeta };
export type WorkspaceRecord<T> = { data: T };

export const toWorkspacePage = <T>(
  data: T[],
  { total, page, limit }: WorkspaceMeta,
): WorkspacePage<T> => ({ data, meta: { total, page, limit } });

type InMemoryQuery<T> = PaginatedSearchQueryDto & {
  sort?: keyof T;
  order?: SortOrder;
};

// Nulls sort last in both directions; text ignores case, everything else (numbers, dates) compares as numbers.
export const compareForSort = (
  a: unknown,
  b: unknown,
  order: SortOrder,
): number => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  const ascending =
    typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b, undefined, { sensitivity: 'base' })
      : Number(a) - Number(b);
  return order === 'desc' ? -ascending : ascending;
};

// shortcut: for admin lists the services return whole (campaigns, quiz questions); filter, sort and page in memory, move into the query if one grows past a few thousand rows.
// `filters` keys left undefined don't filter.
export const pageInMemory = <T extends object>(
  records: T[],
  { page, limit, search, sort, order = 'asc' }: InMemoryQuery<T>,
  searchFields: (keyof T)[],
  filters: Partial<T> = {},
): WorkspacePage<T> => {
  const term = search?.toLowerCase();
  const conditions = Object.entries(filters).filter(
    ([, value]) => value !== undefined,
  );
  const matched = records.filter(
    (record) =>
      conditions.every(
        ([field, value]) => record[field as keyof T] === value,
      ) &&
      (!term ||
        searchFields.some((field) =>
          String(record[field] ?? '')
            .toLowerCase()
            .includes(term),
        )),
  );
  const sorted = sort
    ? [...matched].sort((a, b) => compareForSort(a[sort], b[sort], order))
    : matched;
  return toWorkspacePage(sorted.slice((page - 1) * limit, page * limit), {
    total: sorted.length,
    page,
    limit,
  });
};

export const findRecord = <T extends { id: string }>(
  records: T[],
  id: string,
  label: string,
): T => {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new NotFoundException(`${label} not found`);
  return record;
};
