import { Prisma } from '../generated/prisma/client';

/** Creator-chosen order; `id` only breaks ties so results stay deterministic. */
export const MODULE_ORDER_BY = [
  { order: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ModulesOrderByWithRelationInput[];
