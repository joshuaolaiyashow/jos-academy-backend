import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBadgeDto, UpdateBadgeDto } from './dto/badge.dto';
import {
  Badge,
  BadgeTriggerType,
  EnrollmentStatus,
  EnrollmentType,
  CreditTransactionType,
} from '../generated/prisma/client';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';

type BadgeTriggerConfig = {
  courseId?: string;
  moduleId?: string;
  count?: number;
};

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private requiresConfig(
    triggerType: BadgeTriggerType,
  ): keyof BadgeTriggerConfig | null {
    switch (triggerType) {
      case BadgeTriggerType.COURSE_COMPLETION:
        return 'courseId';
      case BadgeTriggerType.MODULE_COMPLETION:
        return 'moduleId';
      case BadgeTriggerType.COURSES_COMPLETED_MILESTONE:
      case BadgeTriggerType.COURSES_PURCHASED_MILESTONE:
      case BadgeTriggerType.MODULES_PURCHASED_MILESTONE:
      case BadgeTriggerType.CREDIT_PURCHASES_MILESTONE:
        return 'count';
      default:
        return null;
    }
  }

  private buildTriggerConfig(
    dto: CreateBadgeDto | UpdateBadgeDto,
  ): BadgeTriggerConfig | undefined {
    if (!dto.triggerType) return undefined;

    const requiredField = this.requiresConfig(dto.triggerType);
    if (!requiredField) return undefined;

    const value = dto[requiredField];
    if (value === undefined || value === null) {
      throw new BadRequestException(
        `"${requiredField}" is required for trigger type "${dto.triggerType}"`,
      );
    }

    return { [requiredField]: value };
  }

  private async requireBadge(id: string): Promise<Badge> {
    const badge = await this.prisma.badge.findUnique({ where: { id } });
    if (!badge) {
      throw new NotFoundException(`Badge with ID "${id}" not found`);
    }
    return badge;
  }

  async listActiveBadges() {
    return this.prisma.badge.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listAllBadges() {
    return this.prisma.badge.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createBadge(dto: CreateBadgeDto) {
    const triggerConfig = this.buildTriggerConfig(dto);
    const order = dto.order ?? (await this.prisma.badge.count());

    const badge = await this.prisma.badge.create({
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        triggerType: dto.triggerType,
        triggerConfig,
        order,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`🏅 Badge created: ${badge.name} (${badge.triggerType})`);
    return badge;
  }

  async updateBadge(id: string, dto: UpdateBadgeDto) {
    const existing = await this.requireBadge(id);

    const effectiveTriggerType = dto.triggerType ?? existing.triggerType;
    const configFieldsChanged =
      dto.triggerType !== undefined ||
      dto.courseId !== undefined ||
      dto.moduleId !== undefined ||
      dto.count !== undefined;
    const triggerConfig = configFieldsChanged
      ? this.buildTriggerConfig({
          ...dto,
          triggerType: effectiveTriggerType,
        })
      : undefined;

    const updated = await this.prisma.badge.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
        ...(triggerConfig !== undefined && { triggerConfig }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.logger.log(`✏️ Badge updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  async deleteBadge(id: string) {
    await this.requireBadge(id);
    await this.prisma.badge.delete({ where: { id } });
    return { message: 'Badge deleted' };
  }

  async getMyBadges(userId: string) {
    const earned = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });

    return earned.map((entry) => ({
      earnedAt: entry.earnedAt,
      ...entry.badge,
    }));
  }

  async awardBadge(badgeId: string, userId: string) {
    await this.requireBadge(badgeId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    return this.grantBadge(userId, badgeId);
  }

  private async grantBadge(userId: string, badgeId: string) {
    const alreadyEarned = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId } },
    });
    if (alreadyEarned) {
      return alreadyEarned;
    }

    const earned = await this.prisma.userBadge.create({
      data: { userId, badgeId },
    });

    this.logger.log(`🏅 Badge awarded: ${badgeId} → user ${userId}`);
    return earned;
  }

  private async grantMatchingBadges(
    triggerType: BadgeTriggerType,
    userId: string,
    matches: (config: BadgeTriggerConfig) => boolean,
  ): Promise<void> {
    const candidates = await this.prisma.badge.findMany({
      where: { triggerType, isActive: true },
    });

    for (const badge of candidates) {
      const config = (badge.triggerConfig as BadgeTriggerConfig | null) ?? {};
      if (matches(config)) {
        await this.grantBadge(userId, badge.id);
      }
    }
  }

  /** Fired after a lesson is marked complete, to check module/course-scoped and milestone badges. */
  async evaluateLessonCompletion(
    userId: string,
    moduleId: string,
    courseId: string,
  ): Promise<void> {
    try {
      const [moduleLessonCount, moduleCompletedCount] = await Promise.all([
        this.prisma.lesson.count({ where: { moduleId } }),
        this.prisma.lesson.count({
          where: { moduleId, progress: { some: { userId, completed: true } } },
        }),
      ]);

      if (moduleLessonCount > 0 && moduleCompletedCount >= moduleLessonCount) {
        await this.grantMatchingBadges(
          BadgeTriggerType.MODULE_COMPLETION,
          userId,
          (config) => config.moduleId === moduleId,
        );
      }

      const [courseLessonCount, courseCompletedCount] = await Promise.all([
        this.prisma.lesson.count({ where: { module: { courseId } } }),
        this.prisma.lesson.count({
          where: {
            module: { courseId },
            progress: { some: { userId, completed: true } },
          },
        }),
      ]);

      if (courseLessonCount > 0 && courseCompletedCount >= courseLessonCount) {
        await this.grantMatchingBadges(
          BadgeTriggerType.COURSE_COMPLETION,
          userId,
          (config) => config.courseId === courseId,
        );

        const completedCourses = await this.countCompletedCourses(userId);
        await this.grantMatchingBadges(
          BadgeTriggerType.COURSES_COMPLETED_MILESTONE,
          userId,
          (config) =>
            typeof config.count === 'number' &&
            completedCourses >= config.count,
        );
      }
    } catch (error) {
      this.logger.error('Badge evaluation failed for lesson completion', error);
    }
  }

  private async countCompletedCourses(userId: string): Promise<number> {
    const courses = await this.prisma.course.findMany({
      select: {
        id: true,
        modules: { select: { lessons: { select: { id: true } } } },
      },
    });

    let completedCount = 0;
    for (const course of courses) {
      const lessonIds = course.modules.flatMap((mod) =>
        mod.lessons.map((lesson) => lesson.id),
      );
      if (lessonIds.length === 0) continue;

      const completed = await this.prisma.lessonProgress.count({
        where: { userId, completed: true, lessonId: { in: lessonIds } },
      });

      if (completed >= lessonIds.length) {
        completedCount += 1;
      }
    }
    return completedCount;
  }

  /** Fired after a course/module purchase succeeds, to check purchase-count milestone badges. */
  async evaluateEnrollmentPurchase(
    userId: string,
    type: EnrollmentType,
  ): Promise<void> {
    try {
      const purchasedCourses = await this.prisma.enrollment.count({
        where: { userId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
      });
      await this.grantMatchingBadges(
        BadgeTriggerType.COURSES_PURCHASED_MILESTONE,
        userId,
        (config) =>
          typeof config.count === 'number' && purchasedCourses >= config.count,
      );

      if (type === EnrollmentType.MODULAR) {
        const modulesPurchased = await this.prisma.creditTransaction.count({
          where: { userId, type: CreditTransactionType.MODULE_PURCHASE },
        });
        await this.grantMatchingBadges(
          BadgeTriggerType.MODULES_PURCHASED_MILESTONE,
          userId,
          (config) =>
            typeof config.count === 'number' &&
            modulesPurchased >= config.count,
        );
      }
    } catch (error) {
      this.logger.error(
        'Badge evaluation failed for enrollment purchase',
        error,
      );
    }
  }

  /** Fired after a credit top-up is verified, to check credit-purchase-count milestone badges. */
  async evaluateCreditPurchase(userId: string): Promise<void> {
    try {
      const purchases = await this.prisma.creditTransaction.count({
        where: { userId, type: CreditTransactionType.TOP_UP },
      });
      await this.grantMatchingBadges(
        BadgeTriggerType.CREDIT_PURCHASES_MILESTONE,
        userId,
        (config) =>
          typeof config.count === 'number' && purchases >= config.count,
      );
    } catch (error) {
      this.logger.error('Badge evaluation failed for credit purchase', error);
    }
  }
}
