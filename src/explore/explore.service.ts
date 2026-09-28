import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  CourseStatus,
  DurationType,
  TargetLevel,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UPCOMING_OR_LIVE_SESSION_FILTER } from '../live-session/upcoming-session-filter';
import { MODULE_ORDER_BY } from '../course-module/module-order';

const FEATURED_COURSES_LIMIT = 6;

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Browse the course catalog with optional category/level/duration/search filters.
   * Public endpoint — no auth required, matches CourseService.getCourses() conventions.
   */
  async getCatalog(
    categoryId?: string,
    targetLevel?: TargetLevel,
    durationType?: DurationType,
    search?: string,
  ) {
    const whereClause: Prisma.CourseWhereInput = {
      status: CourseStatus.ACTIVE,
      ...(categoryId ? { categoryId } : {}),
      ...(targetLevel ? { targetLevel } : {}),
      ...(durationType ? { durationType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { shortDescription: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const courses = await this.prisma.course.findMany({
      where: whereClause,
      include: {
        category: true,
        modules: { orderBy: MODULE_ORDER_BY },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return {
      total: courses.length,
      filters: {
        categoryId: categoryId || null,
        targetLevel: targetLevel || null,
        durationType: durationType || null,
        search: search || null,
      },
      courses: courses.map((course) => this.withLessonsCount(course)),
    };
  }

  /**
   * Curated subset for the "featured" rail. Course has no createdAt/updatedAt
   * field in the schema, so true recency ordering isn't available — this ranks
   * by richest curriculum (module count) as a real-data proxy instead of
   * fabricating a "recently added" signal.
   */
  async getFeatured() {
    const courses = await this.prisma.course.findMany({
      where: { status: CourseStatus.ACTIVE },
      include: {
        category: true,
        modules: { orderBy: MODULE_ORDER_BY },
      },
      orderBy: [{ modules: { _count: 'desc' } }, { name: 'asc' }],
      take: FEATURED_COURSES_LIMIT,
    });

    this.logger.log(`🌟 Serving ${courses.length} featured explore courses`);

    return {
      total: courses.length,
      courses: courses.map((course) => this.withLessonsCount(course)),
    };
  }

  /**
   * Single course detail for the Explore program page, including upcoming
   * live sessions for that course.
   */
  async getCourseDetail(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, status: CourseStatus.ACTIVE },
      include: {
        category: true,
        modules: {
          orderBy: MODULE_ORDER_BY,
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              // Public catalog: lesson bodies and video URLs are served only by
              // GET /lessons/:id, which checks enrollment.
              omit: {
                videoUrl: true,
                content: true,
                videoProcessingError: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }

    const upcomingSessions = await this.prisma.liveSession.findMany({
      where: { courseId: id, ...UPCOMING_OR_LIVE_SESSION_FILTER() },
      // Recordings are for enrolled learners, via GET /live-sessions/course/:id/recordings.
      omit: { recordingUrl: true },
      orderBy: { scheduledAt: 'asc' },
    });

    return {
      ...this.withLessonsCount(course),
      upcomingSessions,
    };
  }

  /**
   * course.modules[].lessonsCount already exists per-module in the schema;
   * the explore catalog/card UI also needs a course-level total, so it's
   * derived here rather than duplicated as a stored column.
   */
  private withLessonsCount<T extends { modules: { lessonsCount: number }[] }>(
    course: T,
  ): T & { lessonsCount: number } {
    const lessonsCount = course.modules.reduce(
      (sum, mod) => sum + mod.lessonsCount,
      0,
    );
    return { ...course, lessonsCount };
  }
}
