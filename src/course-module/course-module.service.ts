import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { CreateCourseModuleDto } from './dto/create-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { UpdateCourseModuleDto } from './dto/update-module.dto';
import { MODULE_ORDER_BY } from './module-order';

/** Creator-side curriculum structure: add, rename, remove and reorder modules. */
@Injectable()
export class CourseModuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: CourseActor,
    courseId: string,
    dto: CreateCourseModuleDto,
  ) {
    await this.courseAccess.assertCanEditCourse(user, courseId);
    const last = await this.prisma.modules.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.modules.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        lessonsCount: dto.lessonsCount,
        order: last ? last.order + 1 : 0,
      },
    });
  }

  async update(
    user: CourseActor,
    moduleId: string,
    dto: UpdateCourseModuleDto,
  ) {
    const existingModule = await this.courseAccess.findEditableModule(
      user,
      moduleId,
    );
    if (dto.lessonsCount !== undefined) {
      const existingLessons = await this.prisma.lesson.count({
        where: { moduleId },
      });
      if (dto.lessonsCount < existingLessons) {
        throw new BadRequestException(
          `This module already has ${existingLessons} lessons. Delete some before lowering its lesson count to ${dto.lessonsCount}.`,
        );
      }
    }
    const updated = await this.prisma.modules.update({
      where: { id: moduleId },
      data: {
        title: dto.title,
        description: dto.description,
        lessonsCount: dto.lessonsCount,
      },
    });
    if (
      dto.lessonsCount !== undefined &&
      dto.lessonsCount !== existingModule.lessonsCount
    ) {
      await this.audit.record({
        action: AUDIT_ACTIONS.MODULE_LESSON_PLAN_CHANGED,
        targetType: AUDIT_TARGETS.MODULE,
        targetId: moduleId,
        metadata: {
          courseId: existingModule.courseId,
          from: existingModule.lessonsCount,
          to: dto.lessonsCount,
        },
      });
    }
    return updated;
  }

  /**
   * Deleting cascades to the module's lessons and assignments, so a module a
   * learner has paid for or unlocked is never removed.
   */
  async remove(user: CourseActor, moduleId: string) {
    const existingModule = await this.courseAccess.findEditableModule(
      user,
      moduleId,
    );
    const [enrolledCount, paymentsCount, transactionsCount] = await Promise.all(
      [
        this.prisma.enrolledModule.count({ where: { moduleId } }),
        this.prisma.payment.count({ where: { moduleId } }),
        this.prisma.creditTransaction.count({ where: { moduleId } }),
      ],
    );
    if (enrolledCount + paymentsCount + transactionsCount > 0) {
      throw new ConflictException(
        'Learners have already bought or unlocked this module, so it can’t be deleted.',
      );
    }

    await this.prisma.modules.delete({ where: { id: moduleId } });
    await this.audit.record({
      action: AUDIT_ACTIONS.MODULE_DELETED,
      targetType: AUDIT_TARGETS.MODULE,
      targetId: moduleId,
      metadata: {
        courseId: existingModule.courseId,
        title: existingModule.title,
      },
    });
    return { message: 'Module deleted', id: moduleId };
  }

  /** `moduleIds` must list exactly the course's modules, in the new order. */
  async reorder(user: CourseActor, courseId: string, dto: ReorderModulesDto) {
    await this.courseAccess.assertCanEditCourse(user, courseId);
    const existing = await this.prisma.modules.findMany({
      where: { courseId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((module) => module.id));
    const isSameSet =
      dto.moduleIds.length === existingIds.size &&
      dto.moduleIds.every((id) => existingIds.has(id));
    if (!isSameSet) {
      throw new BadRequestException(
        "moduleIds must list every one of this program's modules exactly once.",
      );
    }

    await this.prisma.$transaction(
      dto.moduleIds.map((id, order) =>
        this.prisma.modules.update({ where: { id }, data: { order } }),
      ),
    );
    return this.prisma.modules.findMany({
      where: { courseId },
      orderBy: MODULE_ORDER_BY,
    });
  }
}
