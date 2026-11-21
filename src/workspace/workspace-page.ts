import { NotFoundException } from '@nestjs/common';

import { PaginatedSearchQueryDto } from '../utils/pagination';

export type WorkspaceMeta = { total: number; page: number; limit: number };
export type WorkspacePage<T> = { data: T[]; meta: WorkspaceMeta };
export type WorkspaceRecord<T> = { data: T };

export const toWorkspacePage = <T>(
  data: T[],
  { total, page, limit }: WorkspaceMeta,
): WorkspacePage<T> => ({ data, meta: { total, page, limit } });

// shortcut: for admin lists the services return whole (campaigns, quiz questions); page and search in memory, move into the query if one grows past a few thousand rows.
export const pageInMemory = <T extends object>(
  records: T[],
  { page, limit, search }: PaginatedSearchQueryDto,
  searchFields: (keyof T)[],
): WorkspacePage<T> => {
  const term = search?.toLowerCase();
  const matched = term
    ? records.filter((record) =>
        searchFields.some((field) =>
          String(record[field] ?? '')
            .toLowerCase()
            .includes(term),
        ),
      )
    : records;
  return toWorkspacePage(matched.slice((page - 1) * limit, page * limit), {
    total: matched.length,
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
