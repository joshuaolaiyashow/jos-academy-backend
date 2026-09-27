import 'multer';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { FileUploadService } from '../file-upload/file-upload.service';
import { NotificationService } from '../notification/notification.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PaymentService } from 'src/payment/payment.service';
import { CourseStatus, UserRole } from '../generated/prisma/client';
import { describeLessonPlanGaps } from '../course-module/lesson-plan';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import { CourseAccessService } from '../course-access/course-access.service';
import { NOTIFICATION_LINKS } from '../notification/notification-links';
import { formatDateOnly } from '../utils';
import {
  PROGRAM_REVIEW_LEAD_DAYS,
  describeScheduleProblems,
  earliestStartFor,
  latestSubmitAt,
} from './program-schedule';

type ScheduleInput = {
  startsAt?: string | Date | null;
  enrollmentClosesAt?: string | Date | null;
  endsAt?: string | Date | null;
};

const toDate = (value: string | Date | null | undefined): Date | null =>
  value ? new Date(value) : null;

/** Checks the order of a program's dates once all three are known. */
const assertScheduleInOrder = (schedule: ScheduleInput): void => {
  const dates = {
    startsAt: toDate(schedule.startsAt),
    enrollmentClosesAt: toDate(schedule.enrollmentClosesAt),
    endsAt: toDate(schedule.endsAt),
  };
  if (!dates.startsAt || !dates.enrollmentClosesAt || !dates.endsAt) return;
  const problems = describeScheduleProblems(dates);
  if (problems.length > 0) {
    throw new BadRequestException(`Fix the dates: ${problems.join('; ')}.`);
  }
};

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
    private readonly notificationService: NotificationService,
    private readonly courseAccess: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a new course with optional heroImage file upload, category, and nested modules
   */
  async createCourse(
    dto: CreateCourseDto,
    creatorId: string,
    heroImageFile?: Express.Multer.File,
  ) {
    const { modules, heroImage, categoryId, ...courseData } = dto;
    assertScheduleInOrder(courseData);

    // Verify category exists if categoryId is provided
    if (categoryId) {
      const categoryExists = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!categoryExists) {
        throw new BadRequestException(
          `Category with ID "${categoryId}" does not exist`,
        );
      }
    }

    let heroImageName = courseData.heroImageName;

    // If hero image file is uploaded, upload to AWS S3
    if (heroImageFile) {
      const uploadResult = await this.fileUploadService.uploadFile(
        heroImageFile,
        'courses',
      );
      heroImageName = uploadResult.url;
    }

    const course = await this.prisma.course.create({
      data: {
        ...courseData,
        heroImageName,
        status: CourseStatus.DRAFT,
        categoryId: categoryId || undefined,
        creatorId,
        modules:
          modules && modules.length > 0
            ? {
                create: modules.map((mod) => ({
                  title: mod.title,
                  description: mod.description,
                  lessonsCount: mod.lessonsCount,
                  assignmentsCount: mod.assignmentsCount,
                })),
              }
            : undefined,
      },
      include: {
        category: true,
        modules: { orderBy: MODULE_ORDER_BY },
      },
    });

    this.logger.log(
      `🎓 Course created successfully: ${course.name} (ID: ${course.id})`,
    );
    return {
      message: 'Course created successfully',
      course,
    };
  }

  /**
   * Get all courses with their category and modules, optionally filtered by categoryId
   */
  async getCourses(categoryId?: string) {
    const whereClause = {
      status: CourseStatus.ACTIVE,
      ...(categoryId ? { categoryId } : {}),
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

    const ratings = await this.prisma.review.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courses.map((course) => course.id) } },
      _avg: { rating: true },
      _count: true,
    });
    const ratingsByCourseId = new Map(
      ratings.map((entry) => [
        entry.courseId,
        { rating: entry._avg.rating ?? 0, reviewsCount: entry._count },
      ]),
    );

    return {
      total: courses.length,
      filteredByCategory: categoryId || null,
      courses: courses.map((course) => ({
        ...course,
        ...(ratingsByCourseId.get(course.id) ?? { rating: 0, reviewsCount: 0 }),
      })),
    };
  }

  /**
   * Get single course details by ID including category and modules
   */
  async getCourseById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        category: true,
        modules: { orderBy: MODULE_ORDER_BY },
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }

    const aggregate = await this.prisma.review.aggregate({
      where: { courseId: id },
      _avg: { rating: true },
      _count: true,
    });

    return {
      ...course,
      rating: aggregate._avg.rating ?? 0,
      reviewsCount: aggregate._count,
    };
  }

  /**
   * Returns a submitted program to draft so the creator can keep editing. Only
   * possible while it waits in the queue; once an admin opens it, it is theirs.
   */
  async withdrawFromReview(
    id: string,
    requester: { id: string; role: UserRole },
  ) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }
    if (
      requester.role !== UserRole.ADMIN &&
      course.creatorId !== requester.id
    ) {
      throw new ForbiddenException(
        'You can only withdraw your own courses from review',
      );
    }

    // Conditional on the status so an admin starting the review at the same
    // moment wins cleanly instead of being overwritten.
    const { count } = await this.prisma.course.updateMany({
      where: { id, status: CourseStatus.PENDING_REVIEW },
      data: { status: CourseStatus.DRAFT },
    });
    if (count === 0) {
      throw new BadRequestException(
        course.status === CourseStatus.IN_REVIEW
          ? 'An admin has already started reviewing this program, so it can no longer be withdrawn.'
          : 'Only programs waiting for review can be withdrawn.',
      );
    }

    await this.audit.record({
      action: AUDIT_ACTIONS.COURSE_WITHDRAWN_FROM_REVIEW,
      targetType: AUDIT_TARGETS.COURSE,
      targetId: id,
    });
    this.logger.log(`↩️ Course ${id} withdrawn from review`);
    return {
      message: 'Program withdrawn from review. You can edit it again.',
      course: { ...course, status: CourseStatus.DRAFT },
    };
  }

  /**
   * Sends a draft (or a program sent back for changes) to admins for review.
   * Needs the full schedule, at least PROGRAM_REVIEW_LEAD_DAYS of notice before
   * the start, and every module filled to its lesson plan.
   */
  async submitForReview(id: string, requester: { id: string; role: UserRole }) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }
    if (
      requester.role !== UserRole.ADMIN &&
      course.creatorId !== requester.id
    ) {
      throw new ForbiddenException(
        'You can only submit your own courses for review',
      );
    }

    if (
      course.status !== CourseStatus.DRAFT &&
      course.status !== CourseStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Only draft or rejected courses can be submitted for review',
      );
    }

    const scheduleProblems = describeScheduleProblems(course);
    if (scheduleProblems.length > 0) {
      throw new BadRequestException(
        `Fix the schedule before submitting: ${scheduleProblems.join('; ')}.`,
      );
    }
    const now = new Date();
    if (course.startsAt && now > latestSubmitAt(course.startsAt)) {
      throw new BadRequestException(
        `Submit at least ${PROGRAM_REVIEW_LEAD_DAYS} days before the program starts. Move the start date to ${formatDateOnly(earliestStartFor(now))} or later.`,
      );
    }

    const lessonsCount = await this.prisma.lesson.count({
      where: { module: { courseId: id } },
    });
    if (lessonsCount === 0) {
      throw new BadRequestException(
        'Add at least one lesson before submitting for review',
      );
    }

    const modules = await this.prisma.modules.findMany({
      where: { courseId: id },
      orderBy: MODULE_ORDER_BY,
      select: {
        title: true,
        lessonsCount: true,
        _count: { select: { lessons: true } },
      },
    });
    const planGaps = describeLessonPlanGaps(modules);
    if (planGaps.length > 0) {
      throw new BadRequestException(
        `Every module needs exactly the number of lessons it was planned with. Fix: ${planGaps.join('; ')}.`,
      );
    }

    const updated = await this.prisma.course.update({
      where: { id },
      data: {
        status: CourseStatus.PENDING_REVIEW,
        rejectionReason: null,
        rejectionAttachments: [],
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });
    await this.notificationService.createNotifications(
      admins.map((admin) => admin.id),
      course.name,
      'Course materials were submitted for review.',
      'program-review',
      NOTIFICATION_LINKS.adminProgramReview(id),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.COURSE_SUBMITTED_FOR_REVIEW,
      targetType: AUDIT_TARGETS.COURSE,
      targetId: id,
      metadata: { previousStatus: course.status },
    });
    this.logger.log(`📚 Course ${id} submitted for review`);
    return updated;
  }

  /**
   * Update a course's own fields (not modules). Only the course's creator or
   * an Admin may update it, and creators only while it isn't in review or live.
   */
  async updateCourse(
    id: string,
    dto: UpdateCourseDto,
    requester: { id: string; role: UserRole },
    heroImageFile?: Express.Multer.File,
  ) {
    const existing = await this.prisma.course.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Course with ID "${id}" not found`);
    }

    this.courseAccess.assertCourseEditable(requester, existing);

    const { heroImage, categoryId, ...updateData } = dto;
    assertScheduleInOrder({
      startsAt: updateData.startsAt ?? existing.startsAt,
      enrollmentClosesAt:
        updateData.enrollmentClosesAt ?? existing.enrollmentClosesAt,
      endsAt: updateData.endsAt ?? existing.endsAt,
    });

    if (categoryId) {
      const categoryExists = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!categoryExists) {
        throw new BadRequestException(
          `Category with ID "${categoryId}" does not exist`,
        );
      }
    }

    let heroImageName = updateData.heroImageName;
    if (heroImageFile) {
      const uploadResult = await this.fileUploadService.uploadFile(
        heroImageFile,
        'courses',
      );
      heroImageName = uploadResult.url;
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        ...updateData,
        ...(heroImageName ? { heroImageName } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: true,
        modules: { orderBy: MODULE_ORDER_BY },
      },
    });

    this.logger.log(`✏️ Course updated: ${course.name} (ID: ${course.id})`);

    return {
      message: 'Course updated successfully',
      course,
    };
  }
}
