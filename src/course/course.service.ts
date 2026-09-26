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

    await this.courseAccess.assertCourseEditable(requester, existing);

    const { heroImage, categoryId, ...updateData } = dto;

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
