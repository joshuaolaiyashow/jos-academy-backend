import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { NotificationService } from '../notification/notification.service';
import {
  CourseProjectStatus,
  CourseStatus,
  CreditTransactionType,
  DiscountTarget,
  EnrollmentStatus,
  PaymentStatus,
  PaymentType,
  LiveSessionStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';
import { USD_PER_CREDIT } from '../credit/credit.service';
import { pageMeta, toPrismaPage } from '../utils/pagination';
import { AdminUserStatus } from './dto/update-user-status.dto';
import { CourseReviewDecision } from './dto/review-course.dto';
import { ListProgramsQueryDto } from './dto/list-programs-query.dto';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

const DAY_MS = 24 * 60 * 60 * 1000;
const TRAILING_WINDOW_MS = 30 * DAY_MS;
const ANALYTICS_MONTHS = 12;
const STUDENT_RECENT_ITEMS_LIMIT = 10;

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function monthBuckets(
  count: number,
): { key: string; label: string; start: Date; end: Date }[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    buckets.push({
      key: `${start.getFullYear()}-${start.getMonth()}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      start,
      end,
    });
  }

  return buckets;
}

function bucketKeyForDate(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Platform-wide stats and health metrics, derived from real User/Course/
   * Enrollment/Payment rows. Change percentages compare the trailing 30 days
   * against the 30 days before that.
   */
  async getStats() {
    const now = new Date();
    const currentWindowStart = new Date(now.getTime() - TRAILING_WINDOW_MS);
    const previousWindowStart = new Date(
      now.getTime() - 2 * TRAILING_WINDOW_MS,
    );

    const [
      totalCreators,
      creatorsThisWindow,
      creatorsPreviousWindow,
      totalStudents,
      studentsThisWindow,
      studentsPreviousWindow,
      revenueTotalAgg,
      revenueThisWindowAgg,
      revenuePreviousWindowAgg,
      activeProgramsCount,
      instructorsWithCourses,
      studentsWithEnrollments,
      totalEnrollments,
      completedEnrollments,
      activeLearnersCount,
      creditsPurchasedAgg,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.INSTRUCTOR } }),
      this.prisma.user.count({
        where: {
          role: UserRole.INSTRUCTOR,
          createdAt: { gte: currentWindowStart },
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.INSTRUCTOR,
          createdAt: { gte: previousWindowStart, lt: currentWindowStart },
        },
      }),
      this.prisma.user.count({ where: { role: UserRole.USER } }),
      this.prisma.user.count({
        where: { role: UserRole.USER, createdAt: { gte: currentWindowStart } },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
          createdAt: { gte: previousWindowStart, lt: currentWindowStart },
        },
      }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCESSFUL },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: { gte: currentWindowStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: { gte: previousWindowStart, lt: currentWindowStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.course.count(),
      this.prisma.user.count({
        where: { role: UserRole.INSTRUCTOR, createdCourses: { some: {} } },
      }),
      this.prisma.user.count({
        where: { role: UserRole.USER, enrollments: { some: {} } },
      }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({
        where: { status: EnrollmentStatus.COMPLETED },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
          enrollments: { some: { status: EnrollmentStatus.ACTIVE } },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCESSFUL,
          type: PaymentType.CREDIT_TOP_UP,
        },
        _sum: { credits: true },
      }),
    ]);

    const revenue = revenueTotalAgg._sum.amount ?? 0;
    const revenueThisWindow = revenueThisWindowAgg._sum.amount ?? 0;
    const revenuePreviousWindow = revenuePreviousWindowAgg._sum.amount ?? 0;

    const stats = {
      totalCreators,
      totalCreatorsChangePercent: percentChange(
        creatorsThisWindow,
        creatorsPreviousWindow,
      ),
      totalStudents,
      totalStudentsChangePercent: percentChange(
        studentsThisWindow,
        studentsPreviousWindow,
      ),
      revenue,
      revenueChangePercent: percentChange(
        revenueThisWindow,
        revenuePreviousWindow,
      ),
      activeProgramsCount,
    };

    const platformHealth = [
      {
        id: 'creator-activity-rate',
        label: 'Creator Activity Rate',
        displayValue: `${totalCreators > 0 ? Math.round((instructorsWithCourses / totalCreators) * 100) : 0}%`,
        percent:
          totalCreators > 0
            ? Math.round((instructorsWithCourses / totalCreators) * 100)
            : 0,
        colorClassName: 'bg-green-500',
      },
      {
        id: 'student-enrollment-rate',
        label: 'Student Enrollment Rate',
        displayValue: `${totalStudents > 0 ? Math.round((studentsWithEnrollments / totalStudents) * 100) : 0}%`,
        percent:
          totalStudents > 0
            ? Math.round((studentsWithEnrollments / totalStudents) * 100)
            : 0,
        colorClassName: 'bg-blue-500',
      },
      {
        id: 'program-completion',
        label: 'Program Completion',
        displayValue: `${totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0}%`,
        percent:
          totalEnrollments > 0
            ? Math.round((completedEnrollments / totalEnrollments) * 100)
            : 0,
        colorClassName: 'bg-orange-500',
      },
    ];

    const studentsStats = {
      totalSignUps: totalStudents,
      activeLearners: activeLearnersCount,
      creditsPurchased: creditsPurchasedAgg._sum.credits ?? 0,
      completedCount: completedEnrollments,
    };

    const programsStats = {
      totalPrograms: activeProgramsCount,
      activeCount: activeProgramsCount,
      averageRating: 0,
      completedCount: completedEnrollments,
    };

    return { stats, platformHealth, studentsStats, programsStats };
  }

  /**
   * Paginated list of real students (role USER) with enrollment, credit,
   * payment, and reward data drawn from live tables. `learningProgress`,
   * `payments`, and `rewards` are capped at the most recent items to keep
   * the per-student fan-out bounded.
   */
  async getStudents(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      role: UserRole.USER,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          phone: true,
          country: true,
          bio: true,
          credits: true,
          isSuspended: true,
          createdAt: true,
          enrollments: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              course: {
                select: {
                  id: true,
                  name: true,
                  shortDescription: true,
                  heroImageName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const students = await Promise.all(
      users.map((user) => this.buildAdminStudent(user)),
    );

    return { total, page, limit, students };
  }

  private async buildAdminStudent(user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
    country: string | null;
    bio: string | null;
    credits: number;
    isSuspended: boolean;
    createdAt: Date;
    enrollments: {
      id: string;
      status: EnrollmentStatus;
      createdAt: Date;
      course: {
        id: string;
        name: string;
        shortDescription: string;
        heroImageName: string | null;
      };
    }[];
  }) {
    const [payments, redemptions, learningProgress] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId: user.id, status: PaymentStatus.SUCCESSFUL },
        orderBy: { paidAt: 'desc' },
        take: STUDENT_RECENT_ITEMS_LIMIT,
      }),
      this.prisma.discountRedemption.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: STUDENT_RECENT_ITEMS_LIMIT,
        include: { campaign: { select: { percentOff: true } } },
      }),
      Promise.all(
        user.enrollments
          .slice(0, STUDENT_RECENT_ITEMS_LIMIT)
          .map(async (enrollment) => {
            const [
              totalLessonsCount,
              completedLessonsCount,
              assignmentsTotalAgg,
            ] = await Promise.all([
              this.prisma.lesson.count({
                where: { module: { courseId: enrollment.course.id } },
              }),
              this.prisma.lessonProgress.count({
                where: {
                  userId: user.id,
                  completed: true,
                  lesson: { module: { courseId: enrollment.course.id } },
                },
              }),
              this.prisma.modules.aggregate({
                where: { courseId: enrollment.course.id },
                _sum: { assignmentsCount: true },
              }),
            ]);

            const progressPercent =
              totalLessonsCount > 0
                ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
                : 0;

            return {
              id: enrollment.id,
              title: enrollment.course.name,
              description: enrollment.course.shortDescription,
              imageUrl: enrollment.course.heroImageName ?? '',
              progressPercent,
              lessonsCompleted: completedLessonsCount,
              lessonsTotal: totalLessonsCount,
              assignmentsSubmitted: 0,
              assignmentsTotal: assignmentsTotalAgg._sum.assignmentsCount ?? 0,
            };
          }),
      ),
    ]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? '',
      enrolledProgramsCount: user.enrollments.length,
      completedProgramsCount: user.enrollments.filter(
        (enrollment) => enrollment.status === EnrollmentStatus.COMPLETED,
      ).length,
      creditBalance: user.credits,
      status: (user.isSuspended ? 'suspended' : 'active') as AdminUserStatus,
      overview: {
        activeProgramsCount: user.enrollments.filter(
          (enrollment) => enrollment.status === EnrollmentStatus.ACTIVE,
        ).length,
        totalStudentsCount: 0,
        averageRating: 0,
        revenue: payments.reduce((sum, payment) => sum + payment.amount, 0),
      },
      personalInfo: {
        fullName: user.name,
        email: user.email,
        phone: user.phone ?? '',
        country: user.country ?? '',
        timezone: '',
        dateJoined: user.createdAt.toISOString(),
        bio: user.bio ?? '',
      },
      learningProgress,
      payments: payments.map((payment) => ({
        id: payment.id,
        date: (payment.paidAt ?? payment.createdAt).toLocaleDateString(
          'en-US',
          {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          },
        ),
        time: (payment.paidAt ?? payment.createdAt).toLocaleTimeString(
          'en-US',
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        ),
        amount: payment.amount,
        credits: payment.credits ?? 0,
      })),
      rewards: redemptions.map((redemption) => ({
        id: redemption.id,
        date: redemption.createdAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        time: redemption.createdAt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        discountPercent: redemption.campaign.percentOff,
        credits:
          redemption.target === DiscountTarget.COURSE_PURCHASE
            ? redemption.discountAmount
            : 0,
      })),
    };
  }

  /**
   * One page of courses in every status, as light table rows. The heavy
   * detail (modules, lessons, students, session stats) is loaded per program
   * by `getProgram`.
   */
  async getPrograms({ search, ...pageParams }: ListProgramsQueryDto) {
    const where: Prisma.CourseWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { creator: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toPrismaPage(pageParams),
        include: {
          category: true,
          creator: { select: { name: true } },
          modules: { select: { _count: { select: { lessons: true } } } },
        },
      }),
    ]);
    const { ratingsByCourseId, revenueByCourseId } =
      await this.courseRatingsAndRevenue(courses.map((course) => course.id));

    return {
      ...pageMeta(total, pageParams),
      courses: courses.map(({ modules, ...course }) => ({
        ...course,
        ...(ratingsByCourseId.get(course.id) ?? {
          rating: 0,
          reviewsCount: 0,
        }),
        lessonsCount: modules.reduce(
          (sum, courseModule) => sum + courseModule._count.lessons,
          0,
        ),
        totalRevenue: revenueByCourseId.get(course.id) ?? 0,
      })),
    };
  }

  /** One course with its curriculum, enrolled students and live stats. */
  async getProgram(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        creator: { select: { name: true } },
        modules: {
          orderBy: MODULE_ORDER_BY,
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                duration: true,
              },
            },
          },
        },
        projects: {
          where: { status: { not: CourseProjectStatus.ARCHIVED } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { title: true, description: true, milestones: true },
        },
        enrollments: {
          where: { status: { in: ENROLLMENT_ACCESS_STATUSES } },
          select: {
            status: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        liveSessions: {
          where: { status: { not: LiveSessionStatus.CANCELLED } },
          select: { status: true },
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Program with ID "${id}" not found`);
    }

    const { enrollments, liveSessions, projects, ...rest } = course;
    const { ratingsByCourseId, revenueByCourseId } =
      await this.courseRatingsAndRevenue([id]);

    return {
      ...rest,
      ...(ratingsByCourseId.get(id) ?? { rating: 0, reviewsCount: 0 }),
      project: projects[0]
        ? {
            title: projects[0].title,
            description: projects[0].description,
            milestonesCount: projects[0].milestones.length,
          }
        : null,
      students: enrollments.map((enrollment) => enrollment.user),
      stats: {
        studentsEnrolled: enrollments.length,
        completedCount: enrollments.filter(
          (enrollment) => enrollment.status === EnrollmentStatus.COMPLETED,
        ).length,
        totalRevenue: revenueByCourseId.get(id) ?? 0,
        sessionsCompleted: liveSessions.filter(
          (session) => session.status === LiveSessionStatus.ENDED,
        ).length,
        sessionsTotal: liveSessions.length,
      },
    };
  }

  private async courseRatingsAndRevenue(courseIds: string[]) {
    const [ratings, revenue] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds } },
        _avg: { rating: true },
        _count: true,
      }),
      // Purchases are negative credit amounts and refunds positive.
      this.prisma.creditTransaction.groupBy({
        by: ['courseId'],
        where: {
          courseId: { in: courseIds },
          type: {
            in: [
              CreditTransactionType.COURSE_PURCHASE,
              CreditTransactionType.MODULE_PURCHASE,
              CreditTransactionType.REFUND,
            ],
          },
        },
        _sum: { amount: true },
      }),
    ]);
    const ratingsByCourseId = new Map(
      ratings.map((entry) => [
        entry.courseId,
        { rating: entry._avg.rating ?? 0, reviewsCount: entry._count },
      ]),
    );
    const revenueByCourseId = new Map(
      revenue.map((entry) => [
        entry.courseId,
        -(entry._sum.amount ?? 0) * USD_PER_CREDIT,
      ]),
    );

    return { ratingsByCourseId, revenueByCourseId };
  }

  /** Everything the full-page review shows: the schedule and the whole program. */
  async getProgramForReview(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        shortDescription: true,
        fullDescription: true,
        tuitionFee: true,
        maxCohortSize: true,
        startsAt: true,
        enrollmentClosesAt: true,
        endsAt: true,
        rejectionReason: true,
        creator: { select: { id: true, name: true, email: true } },
        modules: {
          orderBy: MODULE_ORDER_BY,
          select: {
            id: true,
            title: true,
            description: true,
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                contentType: true,
                duration: true,
              },
            },
            assignments: {
              select: {
                id: true,
                title: true,
                description: true,
                questions: true,
                maxScore: true,
                publishedAt: true,
              },
            },
          },
        },
        projects: {
          select: {
            id: true,
            title: true,
            description: true,
            milestones: true,
            submissionType: true,
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Program with ID "${id}" not found`);
    }
    return course;
  }

  /**
   * Moves a PENDING_REVIEW course to IN_REVIEW, which locks the creator out of
   * editing until the review ends. The status guard in the update makes two
   * admins clicking at once safe: only one transition succeeds.
   */
  async startReview(id: string) {
    const { count } = await this.prisma.course.updateMany({
      where: { id, status: CourseStatus.PENDING_REVIEW },
      data: { status: CourseStatus.IN_REVIEW },
    });
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, creatorId: true },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }
    if (count === 0) {
      throw new BadRequestException(
        'Only courses pending review can be moved into review',
      );
    }

    if (course.creatorId) {
      await this.notificationService.createNotification(
        course.creatorId,
        course.name,
        'An admin started reviewing your course. Editing is paused until the review is finished.',
        'program-review',
        NOTIFICATION_LINKS.creatorPrograms(),
      );
    }

    await this.audit.record({
      action: AUDIT_ACTIONS.COURSE_REVIEW_STARTED,
      targetType: AUDIT_TARGETS.COURSE,
      targetId: id,
    });
    this.logger.log(`📚 Course ${id} moved into review by admin`);
    return { id: course.id, status: course.status };
  }

  /**
   * Approves (goes live) or rejects an IN_REVIEW course, then tells its creator in-app
   * (pushed live) and by email. Screenshots are kept only on reject.
   */
  async reviewCourse(
    id: string,
    decision: CourseReviewDecision,
    reason?: string,
    attachmentUrls: string[] = [],
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { creator: { select: { email: true, name: true } } },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }
    if (course.status !== CourseStatus.IN_REVIEW) {
      throw new BadRequestException(
        'Start the review before approving or rejecting this course',
      );
    }

    const approved = decision === 'ACTIVE';
    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        status: approved ? CourseStatus.ACTIVE : CourseStatus.REJECTED,
        rejectionReason: approved ? null : (reason ?? null),
        rejectionAttachments: approved ? [] : attachmentUrls,
      },
    });

    if (course.creatorId) {
      await this.notificationService.createNotification(
        course.creatorId,
        course.name,
        approved
          ? 'Your course was approved and is now live.'
          : `Your course needs changes before it can go live${reason ? `: ${reason}` : '.'}`,
        'program-review',
        NOTIFICATION_LINKS.creatorPrograms(),
      );
    }
    if (course.creator) {
      await this.notificationService.sendCourseReviewEmail({
        email: course.creator.email,
        name: course.creator.name,
        courseName: course.name,
        approved,
        reason,
        attachmentUrls: updated.rejectionAttachments,
      });
    }

    await this.audit.record({
      action: approved
        ? AUDIT_ACTIONS.COURSE_APPROVED
        : AUDIT_ACTIONS.COURSE_REJECTED,
      targetType: AUDIT_TARGETS.COURSE,
      targetId: id,
      metadata: approved
        ? {}
        : {
            reason: reason ?? null,
            attachmentsCount: updated.rejectionAttachments.length,
          },
    });
    this.logger.log(
      `📚 Course ${id} ${approved ? 'approved' : 'rejected'} by admin`,
    );
    return {
      id: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      rejectionAttachments: updated.rejectionAttachments,
    };
  }

  /**
   * Suspends or reactivates a student or creator account. Scoped by role so
   * a student-status call can't be used to suspend an admin, and vice versa.
   */
  async updateUserStatus(id: string, role: UserRole, status: AdminUserStatus) {
    const user = await this.prisma.user.findFirst({ where: { id, role } });
    if (!user) {
      throw new NotFoundException(
        `User with ID "${id}" and role ${role} not found`,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isSuspended: status === 'suspended' },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
      targetType: AUDIT_TARGETS.USER,
      targetId: id,
      metadata: {
        role,
        from: user.isSuspended ? 'suspended' : 'active',
        to: status,
      },
    });
    this.logger.log(`👤 Admin set user ${id} status to ${status}`);

    return {
      id: updated.id,
      status: (updated.isSuspended ? 'suspended' : 'active') as AdminUserStatus,
    };
  }

  /**
   * Revenue, growth, category, and funnel analytics for the trailing 12
   * months. Bucketing happens in JS rather than SQL date-trunc since the
   * dataset size doesn't yet warrant raw queries.
   */
  async getAnalytics() {
    const buckets = monthBuckets(ANALYTICS_MONTHS);
    const rangeStart = buckets[0].start;

    const [payments, students, courses] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: { gte: rangeStart },
        },
        select: {
          amount: true,
          paidAt: true,
          courseId: true,
          course: {
            select: { category: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.USER, createdAt: { gte: rangeStart } },
        select: { createdAt: true },
      }),
      this.prisma.course.findMany({
        select: { id: true, category: { select: { id: true, name: true } } },
      }),
    ]);

    const revenueByMonth = new Map<string, number>(
      buckets.map((bucket) => [bucket.key, 0]),
    );
    const signupsByMonth = new Map<string, number>(
      buckets.map((bucket) => [bucket.key, 0]),
    );

    for (const payment of payments) {
      if (!payment.paidAt) continue;
      const key = bucketKeyForDate(payment.paidAt);
      if (revenueByMonth.has(key)) {
        revenueByMonth.set(
          key,
          (revenueByMonth.get(key) ?? 0) + payment.amount,
        );
      }
    }

    for (const student of students) {
      const key = bucketKeyForDate(student.createdAt);
      if (signupsByMonth.has(key)) {
        signupsByMonth.set(key, (signupsByMonth.get(key) ?? 0) + 1);
      }
    }

    const monthlyRevenue = buckets.map((bucket) => ({
      month: bucket.label,
      value: revenueByMonth.get(bucket.key) ?? 0,
    }));

    let cumulativeSignups = 0;
    const studentGrowth = buckets.map((bucket) => {
      cumulativeSignups += signupsByMonth.get(bucket.key) ?? 0;
      return { month: bucket.label, value: cumulativeSignups };
    });

    const categoryColors = [
      '#2563eb',
      '#38bdf8',
      '#22c55e',
      '#f59e0b',
      '#f97316',
      '#22d3ee',
    ];
    const programsByCategoryMap = new Map<
      string,
      { category: string; value: number }
    >();
    for (const course of courses) {
      const categoryId = course.category?.id ?? 'uncategorized';
      const categoryName = course.category?.name ?? 'Uncategorized';
      const entry = programsByCategoryMap.get(categoryId) ?? {
        category: categoryName,
        value: 0,
      };
      entry.value += 1;
      programsByCategoryMap.set(categoryId, entry);
    }

    const revenueByCategoryMap = new Map<
      string,
      { category: string; value: number }
    >();
    for (const payment of payments) {
      const categoryId = payment.course?.category?.id ?? 'uncategorized';
      const categoryName = payment.course?.category?.name ?? 'Uncategorized';
      const entry = revenueByCategoryMap.get(categoryId) ?? {
        category: categoryName,
        value: 0,
      };
      entry.value += payment.amount;
      revenueByCategoryMap.set(categoryId, entry);
    }

    const toCategoryEntries = (
      map: Map<string, { category: string; value: number }>,
    ) =>
      Array.from(map.entries()).map(([id, entry], index) => ({
        id,
        category: entry.category,
        value: entry.value,
        colorHex: categoryColors[index % categoryColors.length],
      }));

    const [signUpsCount, enrolmentsCount, completionsCount] = await Promise.all(
      [
        this.prisma.user.count({ where: { role: UserRole.USER } }),
        this.prisma.enrollment.count(),
        this.prisma.enrollment.count({
          where: { status: EnrollmentStatus.COMPLETED },
        }),
      ],
    );

    const conversionFunnel = [
      { id: 'sign-ups', label: 'Sign Ups', percent: 100, count: signUpsCount },
      {
        id: 'enrolments',
        label: 'Enrolments',
        percent:
          signUpsCount > 0
            ? Math.round((enrolmentsCount / signUpsCount) * 100)
            : 0,
        count: enrolmentsCount,
      },
      {
        id: 'completions',
        label: 'Completions',
        percent:
          signUpsCount > 0
            ? Math.round((completionsCount / signUpsCount) * 100)
            : 0,
        count: completionsCount,
      },
    ];

    return {
      monthlyRevenue,
      studentGrowth,
      programsByCategory: toCategoryEntries(programsByCategoryMap),
      revenueByCategory: toCategoryEntries(revenueByCategoryMap),
      conversionFunnel,
    };
  }
}
