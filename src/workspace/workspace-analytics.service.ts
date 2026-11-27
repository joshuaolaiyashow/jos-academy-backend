import { Injectable } from '@nestjs/common';

import {
  EnrollmentStatus,
  PaymentStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaPage } from '../utils/pagination';
import {
  type ChartWindow,
  percent,
  previousWindow,
  toSeries,
} from './chart-window';
import type { FunnelPeopleQueryDto } from './dto/funnel-people-query.dto';
import { toWorkspacePage, type WorkspacePage } from './workspace-page';

type Stat = { value: number; previous?: number };
type Point = { date: string; value: number };
type Slice = { label: string; value: number };
type BucketRow = { bucket: Date; value: number };
type FunnelPerson = {
  id: string;
  email: string;
  name: string;
  signedUpAt: Date;
};

const BREAKDOWN_LIMIT = 10;
// An enrolment counts once it's paid for; PENDING is a checkout that never finished.
const PAID_ENROLMENTS = [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED];

const ENROLMENT_LABELS: Record<EnrollmentStatus, string> = {
  PENDING: 'Checkout not finished',
  ACTIVE: 'Learning',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// The signup funnel's steps after "Signed up", in journey order; a drop-off's `step` indexes into them from 1.
export const SIGNUP_FUNNEL_STEPS = [
  'Verified email',
  'Finished onboarding',
  'Started a checkout',
  'Paid for a program',
  'Completed a lesson',
  'Completed a program',
  'Got a certificate',
] as const;
const SIGNUP_FUNNEL_LABELS = ['Signed up', ...SIGNUP_FUNNEL_STEPS];

const inWindow = ({ from, to }: ChartWindow) => ({ gte: from, lt: to });

/** Overview charts for the JOS Workspace, listed under `analytics` in the workspace manifest. Amounts are USD. */
@Injectable()
export class WorkspaceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async withPrevious(
    window: ChartWindow,
    measure: (window: ChartWindow) => Promise<number>,
  ): Promise<Stat> {
    const [value, previous] = await Promise.all([
      measure(window),
      measure(previousWindow(window)),
    ]);
    return { value, previous };
  }

  totalStudents(): Promise<Stat> {
    return this.prisma.user
      .count({ where: { role: UserRole.USER } })
      .then((value) => ({ value }));
  }

  newStudents(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) =>
      this.prisma.user.count({
        where: { role: UserRole.USER, createdAt: inWindow(range) },
      }),
    );
  }

  async onboardingCompletion(): Promise<Stat> {
    const [students, onboarded] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      this.prisma.studentOnboarding.count({
        where: { isCompleted: true, user: { role: UserRole.USER } },
      }),
    ]);
    return { value: percent(onboarded, students) };
  }

  private sumRevenue(range: ChartWindow): Promise<number> {
    return this.prisma.payment
      .aggregate({
        where: { status: PaymentStatus.SUCCESSFUL, paidAt: inWindow(range) },
        _sum: { amount: true },
      })
      .then((result) => result._sum.amount ?? 0);
  }

  revenue(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) => this.sumRevenue(range));
  }

  enrolments(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) =>
      this.prisma.enrollment.count({
        where: { status: { in: PAID_ENROLMENTS }, createdAt: inWindow(range) },
      }),
    );
  }

  lessonsCompleted(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) =>
      this.prisma.lessonProgress.count({
        where: { completed: true, completedAt: inWindow(range) },
      }),
    );
  }

  certificatesIssued(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) =>
      this.prisma.certificate.count({ where: { issuedAt: inWindow(range) } }),
    );
  }

  failedPayments(window: ChartWindow): Promise<Stat> {
    return this.withPrevious(window, (range) =>
      this.prisma.payment.count({
        where: { status: PaymentStatus.FAILED, createdAt: inWindow(range) },
      }),
    );
  }

  async averageRating(): Promise<Stat> {
    const result = await this.prisma.review.aggregate({
      _avg: { rating: true },
    });
    // One decimal, so 4.25 stars reads as 4.3 rather than 4.
    return { value: Math.round((result._avg.rating ?? 0) * 10) / 10 };
  }

  async signups(window: ChartWindow): Promise<Point[]> {
    const rows = await this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${window.interval}::text, "createdAt") AS bucket, count(*)::int AS value
      FROM "User"
      WHERE role = 'USER' AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to}
      GROUP BY 1`;
    return toSeries(window, rows);
  }

  async revenueOverTime(window: ChartWindow): Promise<Point[]> {
    const rows = await this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${window.interval}::text, "paidAt") AS bucket, sum(amount)::int AS value
      FROM "Payment"
      WHERE status = 'SUCCESSFUL' AND "paidAt" >= ${window.from} AND "paidAt" < ${window.to}
      GROUP BY 1`;
    return toSeries(window, rows);
  }

  async enrolmentsOverTime(window: ChartWindow): Promise<Point[]> {
    const rows = await this.prisma.$queryRaw<BucketRow[]>`
      SELECT date_trunc(${window.interval}::text, "createdAt") AS bucket, count(*)::int AS value
      FROM "Enrollment"
      WHERE status IN ('ACTIVE', 'COMPLETED') AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to}
      GROUP BY 1`;
    return toSeries(window, rows);
  }

  private async withCourseTitles(
    rows: { courseId: string | null; value: number }[],
  ): Promise<Slice[]> {
    const ids = rows.flatMap((row) => (row.courseId ? [row.courseId] : []));
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const titles = new Map(courses.map((course) => [course.id, course.name]));
    return rows.map((row) => ({
      label: (row.courseId && titles.get(row.courseId)) || 'Credit top-ups',
      value: row.value,
    }));
  }

  async topPrograms(window: ChartWindow): Promise<Slice[]> {
    const groups = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      where: { status: { in: PAID_ENROLMENTS }, createdAt: inWindow(window) },
      _count: { _all: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: BREAKDOWN_LIMIT,
    });
    return this.withCourseTitles(
      groups.map((group) => ({
        courseId: group.courseId,
        value: group._count._all,
      })),
    );
  }

  // Payments without a course are credit top-ups, so they get their own slice.
  async revenueByProgram(window: ChartWindow): Promise<Slice[]> {
    const groups = await this.prisma.payment.groupBy({
      by: ['courseId'],
      where: { status: PaymentStatus.SUCCESSFUL, paidAt: inWindow(window) },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: BREAKDOWN_LIMIT,
    });
    return this.withCourseTitles(
      groups.map((group) => ({
        courseId: group.courseId,
        value: group._sum.amount ?? 0,
      })),
    );
  }

  async enrolmentsByStatus(): Promise<Slice[]> {
    const groups = await this.prisma.enrollment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return groups
      .map((group) => ({
        label: ENROLMENT_LABELS[group.status],
        value: group._count._all,
      }))
      .sort((a, b) => b.value - a.value);
  }

  // Who is still in after each step: stages[0] is everyone who signed up in the window, stages[n] those who passed
  // steps 1..n, ever. A step only counts people who passed every step before it, so the stages always narrow.
  // shortcut: the cohort's ids are held in memory; switch to one SQL query once a single window holds ~100k signups.
  private async signupStages(window: ChartWindow): Promise<string[][]> {
    const cohort = await this.prisma.user.findMany({
      where: { role: UserRole.USER, createdAt: inWindow(window) },
      select: { id: true, isEmailVerified: true },
    });
    const userId = { in: cohort.map((user) => user.id) };
    const idsOf = async (rows: Promise<{ userId: string }[]>) =>
      new Set((await rows).map((row) => row.userId));
    const enrolled = (where: Prisma.EnrollmentWhereInput = {}) =>
      idsOf(
        this.prisma.enrollment.findMany({
          where: { userId, ...where },
          select: { userId: true },
        }),
      );
    const verified = new Set(
      cohort.filter((user) => user.isEmailVerified).map((user) => user.id),
    );
    // Same order as SIGNUP_FUNNEL_STEPS.
    const reached = [
      verified,
      ...(await Promise.all([
        idsOf(
          this.prisma.studentOnboarding.findMany({
            where: { userId, isCompleted: true },
            select: { userId: true },
          }),
        ),
        enrolled(),
        enrolled({ status: { in: PAID_ENROLMENTS } }),
        idsOf(
          this.prisma.lessonProgress.findMany({
            where: { userId, completed: true },
            select: { userId: true },
          }),
        ),
        enrolled({ status: EnrollmentStatus.COMPLETED }),
        idsOf(
          this.prisma.certificate.findMany({
            where: { userId },
            select: { userId: true },
          }),
        ),
      ])),
    ];
    const stages = [cohort.map((user) => user.id)];
    for (const step of reached) {
      stages.push(stages[stages.length - 1].filter((id) => step.has(id)));
    }
    return stages;
  }

  async signupFunnel(window: ChartWindow): Promise<Slice[]> {
    const stages = await this.signupStages(window);
    return stages.map((ids, index) => ({
      label: SIGNUP_FUNNEL_LABELS[index],
      value: ids.length,
    }));
  }

  /** People from the window's signups who reached step `step - 1` but not `step` (1 = never verified their email). */
  async signupDropoffIds(window: ChartWindow, step: number): Promise<string[]> {
    const stages = await this.signupStages(window);
    const passed = new Set(stages[step]);
    return stages[step - 1].filter((id) => !passed.has(id));
  }

  async signupDropoffs(
    query: FunnelPeopleQueryDto,
  ): Promise<WorkspacePage<FunnelPerson>> {
    const ids = await this.signupDropoffIds(query, query.step);
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...toPrismaPage(query),
      select: { id: true, email: true, name: true, createdAt: true },
    });
    return toWorkspacePage(
      rows.map(({ createdAt, ...person }) => ({
        ...person,
        signedUpAt: createdAt,
      })),
      { total: ids.length, page: query.page, limit: query.limit },
    );
  }
}
