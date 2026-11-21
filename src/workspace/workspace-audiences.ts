import { BadRequestException, Injectable } from '@nestjs/common';

import { EnrollmentStatus, Prisma, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AudienceQueryDto,
  StudentAudienceQueryDto,
} from './dto/audience.dto';
import {
  VALIDATION_FAILED,
  WORKSPACE_AUDIENCES_PATH,
} from './workspace.constants';

export const AUDIENCE_KEYS = {
  STUDENTS: 'students',
  INSTRUCTORS: 'instructors',
} as const;
export type AudienceKey = (typeof AUDIENCE_KEYS)[keyof typeof AUDIENCE_KEYS];

const PROGRAM_FILTER_KEY = 'program';
// Paid-up and finished learners; PENDING is an unpaid checkout, CANCELLED has left.
const STUDENT_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

// Prisma passes `contains` through to ILIKE unescaped, so `%` or `_` in a search would act as wildcards.
export const escapeLikePattern = (term: string): string =>
  term.replace(/[\\%_]/g, '\\$&');

type FilterOption = { value: string; label: string };
export type AudienceManifestEntry = {
  key: AudienceKey;
  label: string;
  description: string;
  path: string;
  kind: 'users';
  filters?: { key: string; label: string; options: FilterOption[] }[];
};
export type AudienceMember = { email: string; name: string };
export type AudiencePage = {
  data: AudienceMember[];
  meta: { nextCursor: string | null; total: number };
};

export const audienceWhere = (
  audience: AudienceKey,
  query: AudienceQueryDto & Partial<Pick<StudentAudienceQueryDto, 'program'>>,
): Prisma.UserWhereInput => ({
  isSuspended: false,
  email: { not: '' },
  ...(query.includeOptedOut ? {} : { marketingOptOut: false }),
  ...(audience === AUDIENCE_KEYS.INSTRUCTORS
    ? { role: UserRole.INSTRUCTOR }
    : {
        role: UserRole.USER,
        enrollments: {
          some: {
            status: { in: STUDENT_ENROLLMENT_STATUSES },
            ...(query.program ? { courseId: query.program } : {}),
          },
        },
      }),
  ...(query.search
    ? {
        OR: [
          {
            email: {
              contains: escapeLikePattern(query.search),
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: escapeLikePattern(query.search),
              mode: 'insensitive',
            },
          },
        ],
      }
    : {}),
});

@Injectable()
export class WorkspaceAudiencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Built per request so the program filter always lists the current cohorts. */
  async manifestEntries(): Promise<AudienceManifestEntry[]> {
    const programs = await this.prisma.course.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return [
      {
        key: AUDIENCE_KEYS.STUDENTS,
        label: 'Students',
        description: 'Learners enrolled in a program',
        path: `/${WORKSPACE_AUDIENCES_PATH}/${AUDIENCE_KEYS.STUDENTS}`,
        kind: 'users',
        filters: [
          {
            key: PROGRAM_FILTER_KEY,
            label: 'Program',
            options: programs.map(({ id, name }) => ({
              value: id,
              label: name,
            })),
          },
        ],
      },
      {
        key: AUDIENCE_KEYS.INSTRUCTORS,
        label: 'Instructors',
        description: 'Everyone with the instructor role',
        path: `/${WORKSPACE_AUDIENCES_PATH}/${AUDIENCE_KEYS.INSTRUCTORS}`,
        kind: 'users',
      },
    ];
  }

  async list(
    audience: AudienceKey,
    query: AudienceQueryDto & Partial<Pick<StudentAudienceQueryDto, 'program'>>,
  ): Promise<AudiencePage> {
    // An unknown program must fail loudly: ignoring it would widen a cohort mail to every student.
    if (
      query.program &&
      !(await this.prisma.course.count({ where: { id: query.program } }))
    ) {
      throw new BadRequestException({
        message: 'Unknown program',
        code: VALIDATION_FAILED,
      });
    }
    const where = audienceWhere(audience, query);
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where: query.cursor
          ? { AND: [where, { id: { gt: query.cursor } }] }
          : where,
        orderBy: { id: 'asc' },
        take: query.limit + 1,
        select: { id: true, email: true, name: true },
      }),
    ]);
    const page = rows.slice(0, query.limit);
    return {
      data: page.map(({ email, name }) => ({ email, name })),
      meta: {
        nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
        total,
      },
    };
  }

  /** Idempotent: an already opted-out user keeps the original opt-out time. */
  async unsubscribe(
    email: string,
  ): Promise<{ email: string; unsubscribed: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, marketingOptOut: true },
    });
    if (!user) return { email, unsubscribed: false };
    if (!user.marketingOptOut) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { marketingOptOut: true, marketingOptOutAt: new Date() },
      });
    }
    return { email, unsubscribed: true };
  }
}
