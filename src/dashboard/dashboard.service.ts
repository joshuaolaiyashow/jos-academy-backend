import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UPCOMING_OR_LIVE_SESSION_FILTER } from '../live-session/upcoming-session-filter';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { CreditService } from '../credit/credit.service';
import { EnrollmentStatus } from '../generated/prisma/client';

const UPCOMING_SESSIONS_LIMIT = 5;
const RECENT_NOTIFICATIONS_LIMIT = 5;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollmentService: EnrollmentService,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Compose the logged-in learner's dashboard from live Prisma data:
   * active enrollments with progress, credit balance, upcoming live
   * sessions for enrolled courses, and recent notifications.
   */
  async getDashboard(userId: string) {
    const [
      enrollments,
      creditBalance,
      recentNotifications,
      unreadNotificationsCount,
    ] = await Promise.all([
      this.getActiveEnrollmentsWithProgress(userId),
      this.creditService.getBalance(userId),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: RECENT_NOTIFICATIONS_LIMIT,
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const upcomingLiveSessions = await this.getUpcomingLiveSessions(
      enrollments.map((enrollment) => enrollment.courseId),
    );

    this.logger.log(`📊 Dashboard composed for user ${userId}`);

    return {
      enrollments,
      creditBalance,
      upcomingLiveSessions,
      recentNotifications,
      unreadNotificationsCount,
    };
  }

  /**
   * Active and completed enrollments enriched with module-level and
   * lesson-level progress. Completed enrollments must still surface here —
   * otherwise a finished course never appears on the dashboard, and the
   * student never gets a chance to rate it (see ReviewModule).
   */
  private async getActiveEnrollmentsWithProgress(userId: string) {
    const { enrollments } =
      await this.enrollmentService.getMyEnrollments(userId);
    const visibleEnrollments = enrollments.filter(
      (enrollment) =>
        enrollment.status === EnrollmentStatus.ACTIVE ||
        enrollment.status === EnrollmentStatus.COMPLETED,
    );

    return visibleEnrollments.map((enrollment) => ({
      id: enrollment.id,
      courseId: enrollment.courseId,
      courseName: enrollment.courseName,
      heroImage: enrollment.heroImage,
      category: enrollment.category,
      type: enrollment.type,
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
      totalCourseModules: enrollment.totalCourseModules,
      unlockedModulesCount: enrollment.unlockedModulesCount,
      completedLessonsCount: enrollment.completedLessonsCount,
      totalLessonsCount: enrollment.totalLessonsCount,
      createdAt: enrollment.createdAt,
    }));
  }

  /**
   * Upcoming live sessions scoped to the learner's enrolled courses.
   */
  private async getUpcomingLiveSessions(courseIds: string[]) {
    if (courseIds.length === 0) {
      return [];
    }

    const sessions = await this.prisma.liveSession.findMany({
      where: {
        courseId: { in: courseIds },
        ...UPCOMING_OR_LIVE_SESSION_FILTER(),
      },
      orderBy: { scheduledAt: 'asc' },
      take: UPCOMING_SESSIONS_LIMIT,
      include: {
        course: { select: { name: true } },
        creator: { select: { name: true } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      scheduledAt: session.scheduledAt,
      durationMins: session.durationMins,
      status: session.status,
      courseName: session.course.name,
      creatorName: session.creator.name,
    }));
  }
}
