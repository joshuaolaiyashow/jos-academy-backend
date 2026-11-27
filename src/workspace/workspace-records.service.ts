import { Injectable, NotFoundException } from '@nestjs/common';

import { PaymentStatus, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// shortcut: tabs show the latest rows only, not a paged list; page them if a record ever needs more than this.
const TAB_ROW_LIMIT = 100;
const NEWEST_FIRST = { createdAt: 'desc' } as const;

/**
 * The related lists on a workspace record's detail sheet (a student's payments, a creator's programs), as flat rows
 * whose keys match the manifest's tab fields.
 */
@Injectable()
export class WorkspaceRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Programs per status, for the workspace's status tabs; statuses with none are left out. */
  async programStatusCounts(): Promise<Record<string, number>> {
    const groups = await this.prisma.course.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(
      groups.map(({ status, _count }) => [status, _count._all]),
    );
  }

  async studentPrograms(userId: string) {
    await this.requireUser(userId, UserRole.USER);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      orderBy: NEWEST_FIRST,
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        status: true,
        createdAt: true,
        course: { select: { id: true, name: true } },
      },
    });
    const progress = await Promise.all(
      enrollments.map(async ({ course }) => {
        const [total, completed] = await Promise.all([
          this.prisma.lesson.count({
            where: { module: { courseId: course.id } },
          }),
          this.prisma.lessonProgress.count({
            where: {
              userId,
              completed: true,
              lesson: { module: { courseId: course.id } },
            },
          }),
        ]);
        return total > 0 ? Math.round((completed / total) * 100) : 0;
      }),
    );
    return enrollments.map((enrollment, index) => ({
      id: enrollment.id,
      program: enrollment.course.name,
      status: enrollment.status,
      progressPercent: progress[index],
      enrolledAt: enrollment.createdAt,
    }));
  }

  async studentPayments(userId: string) {
    await this.requireUser(userId, UserRole.USER);
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: NEWEST_FIRST,
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        credits: true,
        reference: true,
        paidAt: true,
        createdAt: true,
        course: { select: { name: true } },
      },
    });
    return payments.map(({ course, paidAt, createdAt, ...payment }) => ({
      ...payment,
      program: course?.name ?? null,
      date: paidAt ?? createdAt,
    }));
  }

  async studentRewards(userId: string) {
    await this.requireUser(userId, UserRole.USER);
    const redemptions = await this.prisma.discountRedemption.findMany({
      where: { userId },
      orderBy: NEWEST_FIRST,
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        target: true,
        discountAmount: true,
        createdAt: true,
        campaign: { select: { name: true, code: true, percentOff: true } },
      },
    });
    return redemptions.map(({ campaign, ...redemption }) => ({
      ...redemption,
      campaign: `${campaign.name} (${campaign.code})`,
      percentOff: campaign.percentOff,
    }));
  }

  async creatorPrograms(creatorId: string) {
    await this.requireUser(creatorId, UserRole.INSTRUCTOR);
    // Courses carry no createdAt; the cohort start is the closest order.
    const courses = await this.prisma.course.findMany({
      where: { creatorId },
      orderBy: { startsAt: { sort: 'desc', nulls: 'last' } },
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        _count: { select: { enrollments: true } },
      },
    });
    const revenue = await this.prisma.payment.groupBy({
      by: ['courseId'],
      where: {
        status: PaymentStatus.SUCCESSFUL,
        courseId: { in: courses.map((course) => course.id) },
      },
      _sum: { amount: true },
    });
    const revenueByCourse = new Map(
      revenue.map((row) => [row.courseId, row._sum.amount ?? 0]),
    );
    return courses.map(({ _count, ...course }) => ({
      ...course,
      students: _count.enrollments,
      revenue: revenueByCourse.get(course.id) ?? 0,
    }));
  }

  async creatorReviews(creatorId: string) {
    await this.requireUser(creatorId, UserRole.INSTRUCTOR);
    const reviews = await this.prisma.review.findMany({
      where: { course: { creatorId } },
      orderBy: NEWEST_FIRST,
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        course: { select: { name: true } },
        user: { select: { name: true } },
      },
    });
    return reviews.map(({ course, user, ...review }) => ({
      ...review,
      program: course.name,
      student: user.name,
    }));
  }

  async programLessons(courseId: string) {
    const modules = await this.prisma.modules.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      select: {
        title: true,
        lessons: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, duration: true, videoUrl: true },
        },
      },
    });
    if (modules.length === 0) await this.requireCourse(courseId);
    return modules.flatMap((module) =>
      module.lessons.map((lesson) => ({ ...lesson, module: module.title })),
    );
  }

  async programStudents(courseId: string) {
    await this.requireCourse(courseId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      orderBy: NEWEST_FIRST,
      take: TAB_ROW_LIMIT,
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    return enrollments.map(({ user, ...enrollment }) => ({
      ...enrollment,
      name: user.name,
      email: user.email,
    }));
  }

  private async requireUser(id: string, role: UserRole): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, role },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Person not found');
  }

  private async requireCourse(id: string): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Program not found');
  }
}
