import { ListNotificationsQueryDto } from '../notification/dto/list-notifications-query.dto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LiveSessionService } from '../live-session/live-session.service';
import { NotificationService } from '../notification/notification.service';
import { LiveSessionStatus } from '../generated/prisma/client';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import { contentLockingCohortsWhere } from '../cohort/cohort-phase';

@Injectable()
export class CreatorDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveSessionService: LiveSessionService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * A creator's courses = courses they own directly (Course.creatorId) UNION
   * courses they've scheduled a live session for (covers legacy rows created
   * before Course.creatorId existed).
   */
  private async getCreatorCourseIds(creatorId: string): Promise<string[]> {
    const [ownedCourses, sessions] = await Promise.all([
      this.prisma.course.findMany({
        where: { creatorId },
        select: { id: true },
      }),
      this.prisma.liveSession.findMany({
        where: { creatorId },
        select: { courseId: true },
        distinct: ['courseId'],
      }),
    ]);

    return [
      ...new Set([
        ...ownedCourses.map((c) => c.id),
        ...sessions.map((s) => s.courseId),
      ]),
    ];
  }

  /**
   * Composed summary of a creator's live-session-derived activity
   */
  async getOverview(creatorId: string) {
    const courseIds = await this.getCreatorCourseIds(creatorId);

    const [upcomingSessionsCount, pastSessionsCount, attendanceAggregate] =
      await Promise.all([
        this.prisma.liveSession.count({
          where: {
            creatorId,
            status: {
              in: [LiveSessionStatus.SCHEDULED, LiveSessionStatus.LIVE],
            },
          },
        }),
        this.prisma.liveSession.count({
          where: {
            creatorId,
            status: {
              in: [LiveSessionStatus.ENDED, LiveSessionStatus.CANCELLED],
            },
          },
        }),
        this.prisma.sessionAttendance.count({
          where: { session: { creatorId } },
        }),
      ]);

    return {
      programsCount: courseIds.length,
      upcomingSessionsCount,
      pastSessionsCount,
      totalAttendance: attendanceAggregate,
    };
  }

  /**
   * Distinct courses derived from this creator's LiveSession.courseId values
   */
  async getPrograms(creatorId: string) {
    const courseIds = await this.getCreatorCourseIds(creatorId);

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      include: {
        category: true,
        // Real lesson counts let the dashboard show progress against each module's plan.
        modules: {
          orderBy: MODULE_ORDER_BY,
          include: { _count: { select: { lessons: true } } },
        },
      },
    });

    // Tells the dashboard which programs a cohort is freezing, and why.
    const lockingCohorts = await this.prisma.cohort.findMany({
      where: contentLockingCohortsWhere({ in: courseIds }, new Date()),
      select: { courseId: true, status: true, name: true, endsAt: true },
      orderBy: { endsAt: 'desc' },
    });
    const lockByCourse = new Map(
      lockingCohorts.map(({ courseId, name, ...lock }) => [
        courseId,
        { ...lock, cohortName: name },
      ]),
    );

    return {
      total: courses.length,
      programs: courses.map((course) => ({
        ...course,
        contentLock: lockByCourse.get(course.id) ?? null,
      })),
    };
  }

  /**
   * Lessons for a module, scoped to modules that belong to one of this
   * creator's derived courses. viewsCount is hardcoded to 0 — there is no
   * lesson-view-tracking table in the schema.
   */
  async getContent(creatorId: string, moduleId?: string) {
    if (!moduleId) {
      throw new BadRequestException('moduleId query parameter is required');
    }

    const moduleRecord = await this.prisma.modules.findUnique({
      where: { id: moduleId },
    });
    if (!moduleRecord) {
      throw new NotFoundException(`Module with ID "${moduleId}" not found`);
    }

    const courseIds = await this.getCreatorCourseIds(creatorId);
    if (!courseIds.includes(moduleRecord.courseId)) {
      throw new NotFoundException(`Module with ID "${moduleId}" not found`);
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      total: lessons.length,
      lessons: lessons.map((lesson) => ({ ...lesson, viewsCount: 0 })),
    };
  }

  /**
   * Thin wrapper over LiveSessionService.getMySessions
   */
  async getLiveSessions(creatorId: string) {
    return this.liveSessionService.getMySessions(creatorId);
  }

  /**
   * Thin wrapper over NotificationService.listForUser
   */
  async getNotifications(creatorId: string, query: ListNotificationsQueryDto) {
    return this.notificationService.listForUser(creatorId, query);
  }
}
