import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { BadgesService } from '../badges/badges.service';
import { CertificateService } from '../certificate/certificate.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { RecordEngagementDto } from './dto/record-engagement.dto';
import {
  creditableSeconds,
  MAX_VIDEO_PLAYBACK_RATE,
  requiredEngagementSeconds,
  VIEWING_SESSION_GAP_SECONDS,
} from './lesson-engagement';
import { LessonContentType, UserRole } from '../generated/prisma/client';
import { sanitizeNoteHtml } from './lesson-note-html';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { assertRoomForLesson } from '../course-module/lesson-plan';

const cleanContent = (
  contentType: LessonContentType,
  content: string | undefined,
): string | undefined =>
  content !== undefined && contentType === LessonContentType.note
    ? sanitizeNoteHtml(content)
    : content;

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollmentService: EnrollmentService,
    private readonly badgesService: BadgesService,
    private readonly certificateService: CertificateService,
    private readonly courseAccess: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Shared gate for per-lesson features (notes, discussions): admins, the
   * course's own creator, and learners with access to the lesson's module.
   */
  async assertLessonAccess(
    user: { id: string; role: UserRole },
    lessonId: string,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID "${lessonId}" not found`);
    }

    const courseCreatorId = lesson.module.course.creatorId;
    if (user.role === UserRole.ADMIN || courseCreatorId === user.id) {
      return { lesson, courseCreatorId };
    }

    const { hasAccess } = await this.enrollmentService.checkModuleAccess(
      user.id,
      lesson.module.courseId,
      lesson.moduleId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this lesson.');
    }
    return { lesson, courseCreatorId };
  }

  /**
   * Create a new lesson under a module of a program the requester may edit
   */
  async createLesson(dto: CreateLessonDto, requester: CourseActor) {
    const module = await this.courseAccess.findEditableModule(
      requester,
      dto.moduleId,
    );
    assertRoomForLesson(
      module,
      await this.prisma.lesson.count({ where: { moduleId: module.id } }),
    );

    const lesson = await this.prisma.lesson.create({
      data: { ...dto, content: cleanContent(dto.contentType, dto.content) },
    });

    this.logger.log(
      `📘 Lesson created successfully: ${lesson.title} (ID: ${lesson.id})`,
    );
    return {
      message: 'Lesson created successfully',
      lesson,
    };
  }

  /**
   * Update a lesson's own fields. Only the course's creator (while the
   * program is editable) or an Admin may update it; a lesson can only move
   * to another module of the same program.
   */
  async updateLesson(id: string, dto: UpdateLessonDto, requester: CourseActor) {
    const lesson = await this.courseAccess.findEditableLesson(requester, id);

    if (dto.moduleId && dto.moduleId !== lesson.moduleId) {
      const targetModule = await this.courseAccess.findEditableModule(
        requester,
        dto.moduleId,
      );
      if (targetModule.courseId !== lesson.module.courseId) {
        throw new BadRequestException(
          'A lesson can only move to another module of the same program.',
        );
      }
      assertRoomForLesson(
        targetModule,
        await this.prisma.lesson.count({
          where: { moduleId: targetModule.id },
        }),
      );
    }

    const updated = await this.prisma.lesson.update({
      where: { id },
      data: {
        ...dto,
        content: cleanContent(
          dto.contentType ?? lesson.contentType,
          dto.content,
        ),
      },
    });

    this.logger.log(`✏️ Lesson updated: ${updated.title} (ID: ${updated.id})`);
    return {
      message: 'Lesson updated successfully',
      lesson: updated,
    };
  }

  /**
   * Delete a lesson with its learners' progress, notes and discussions.
   */
  async deleteLesson(id: string, requester: CourseActor) {
    const lesson = await this.courseAccess.findEditableLesson(requester, id);
    await this.prisma.lesson.delete({ where: { id } });
    await this.audit.record({
      action: AUDIT_ACTIONS.LESSON_DELETED,
      targetType: AUDIT_TARGETS.LESSON,
      targetId: id,
      metadata: {
        moduleId: lesson.moduleId,
        courseId: lesson.module.courseId,
        title: lesson.title,
      },
    });

    this.logger.log(`🗑️ Lesson deleted (ID: ${id})`);
    return { message: 'Lesson deleted successfully', id };
  }

  /**
   * Get all lessons for a given module, ordered by their sequence
   */
  async getLessonsByModule(moduleId?: string) {
    if (!moduleId) {
      throw new BadRequestException('moduleId query parameter is required');
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      total: lessons.length,
      lessons,
    };
  }

  /**
   * Get a single lesson, gating full content behind module access
   */
  async getLessonById(id: string, user: { id: string; role: UserRole }) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        module: { include: { course: { select: { creatorId: true } } } },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID "${id}" not found`);
    }

    // Admins reviewing a program and its own creator always see the content.
    const isOwnerOrAdmin =
      user.role === UserRole.ADMIN ||
      lesson.module.course.creatorId === user.id;
    const { hasAccess } = isOwnerOrAdmin
      ? { hasAccess: true }
      : await this.enrollmentService.checkModuleAccess(
          user.id,
          lesson.module.courseId,
          lesson.moduleId,
        );

    if (!hasAccess) {
      return {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        contentType: lesson.contentType,
        duration: lesson.duration,
        order: lesson.order,
        moduleId: lesson.moduleId,
        videoUrl: null,
        content: null,
        locked: true,
      };
    }

    const { module, ...lessonData } = lesson;
    return {
      ...lessonData,
      locked: false,
    };
  }

  private async findAccessibleLesson(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID "${lessonId}" not found`);
    }

    const { hasAccess } = await this.enrollmentService.checkModuleAccess(
      userId,
      lesson.module.courseId,
      lesson.moduleId,
    );
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this lesson.');
    }
    return lesson;
  }

  private toEngagementSummary(
    lesson: Parameters<typeof requiredEngagementSeconds>[0],
    progress: { engagedSeconds: number; completed: boolean } | null,
  ) {
    const requiredSeconds = requiredEngagementSeconds(lesson);
    const engagedSeconds = progress?.engagedSeconds ?? 0;
    return {
      engagedSeconds,
      requiredSeconds,
      canComplete:
        Boolean(progress?.completed) || engagedSeconds >= requiredSeconds,
    };
  }

  /**
   * Where the learner stands on this lesson's watch/read requirement. Opening
   * a lesson after a break starts a fresh viewing session, so idle time
   * between visits is never credited.
   */
  async getEngagement(userId: string, lessonId: string) {
    const lesson = await this.findAccessibleLesson(userId, lessonId);
    const now = new Date();
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const isStale =
      !existing?.lastHeartbeatAt ||
      now.getTime() - existing.lastHeartbeatAt.getTime() >
        VIEWING_SESSION_GAP_SECONDS * 1000;
    const progress = isStale
      ? await this.prisma.lessonProgress.upsert({
          where: { userId_lessonId: { userId, lessonId } },
          create: { userId, lessonId, lastHeartbeatAt: now },
          update: { lastHeartbeatAt: now },
        })
      : existing;
    return this.toEngagementSummary(lesson, progress);
  }

  /** Credits time actually spent watching or reading, bounded by the real time since the last beat. */
  async recordEngagement(
    userId: string,
    lessonId: string,
    dto: RecordEngagementDto,
  ) {
    const lesson = await this.findAccessibleLesson(userId, lessonId);
    const now = new Date();

    if (
      lesson.contentType === LessonContentType.video &&
      dto.videoDurationSeconds &&
      lesson.videoSeconds === null
    ) {
      lesson.videoSeconds = dto.videoDurationSeconds;
      await this.prisma.lesson.update({
        where: { id: lessonId },
        data: { videoSeconds: dto.videoDurationSeconds },
      });
    }

    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const credit = creditableSeconds(
      dto.seconds,
      existing?.lastHeartbeatAt ?? null,
      now,
      lesson.contentType === LessonContentType.video
        ? MAX_VIDEO_PLAYBACK_RATE
        : 1,
    );
    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, engagedSeconds: 0, lastHeartbeatAt: now },
      update: {
        engagedSeconds: { increment: credit },
        lastHeartbeatAt: now,
      },
    });
    return this.toEngagementSummary(lesson, progress);
  }

  /**
   * Mark a lesson as complete for the logged-in student, once they've spent
   * enough time on it (80% of a video, or the reading time of a note/code lesson).
   */
  async completeLesson(userId: string, lessonId: string) {
    const lesson = await this.findAccessibleLesson(userId, lessonId);
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const engagement = this.toEngagementSummary(lesson, existing);
    if (!engagement.canComplete) {
      throw new ConflictException({
        message:
          lesson.contentType === LessonContentType.video
            ? 'Watch more of this video before marking it complete.'
            : 'Spend a little more time on this lesson before marking it complete.',
        ...engagement,
      });
    }

    const progress = await this.prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: { userId, lessonId },
      },
      create: {
        userId,
        lessonId,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `✅ Lesson marked complete: ${lesson.title} (User: ${userId})`,
    );

    await this.badgesService.evaluateLessonCompletion(
      userId,
      lesson.moduleId,
      lesson.module.courseId,
    );
    await this.certificateService.evaluateCourseCompletion(
      userId,
      lesson.module.courseId,
    );

    return {
      message: 'Lesson marked as complete',
      progress,
    };
  }

  /**
   * Get completed lesson IDs for the logged-in student within a course
   */
  async getCourseProgress(userId: string, courseId?: string) {
    if (!courseId) {
      throw new BadRequestException('courseId query parameter is required');
    }

    const completedLessons = await this.prisma.lesson.findMany({
      where: {
        module: { courseId },
        progress: {
          some: { userId, completed: true },
        },
      },
      select: { id: true },
    });

    return {
      courseId,
      completedLessonIds: completedLessons.map((lesson) => lesson.id),
    };
  }
}
