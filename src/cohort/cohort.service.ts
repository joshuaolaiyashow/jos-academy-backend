import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { NOTIFICATION_LINKS } from '../notification/notification-links';
import { CohortStatus, UserRole } from '../generated/prisma/client';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import { describeLessonPlanGaps } from '../course-module/lesson-plan';
import { formatDateOnly } from '../utils';
import {
  CREATOR_EDITABLE_COHORT_STATUSES,
  cohortSalesPhase,
  describeCohortDateProblems,
  describeScheduleProblems,
  earliestStartFor,
  latestSubmitAt,
} from './cohort-phase';
import { COHORT_REVIEW_LEAD_DAYS } from './cohort.constants';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { UpdateCohortDto } from './dto/update-cohort.dto';
import { SetCohortModulesDto } from './dto/set-cohort-modules.dto';

const SCHEDULE_INCLUDE = {
  modules: { select: { moduleId: true, startsAt: true } },
} as const;

const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined ? undefined : value === null ? null : new Date(value);

const assertDatesInOrder = (dates: {
  startsAt: Date;
  enrollmentClosesAt: Date;
  endsAt: Date;
}): void => {
  const problems = describeCohortDateProblems(dates);
  if (problems.length > 0) {
    throw new BadRequestException(`Fix the dates: ${problems.join('; ')}.`);
  }
};

/** Creator-side cohort management plus the public list learners buy from. */
@Injectable()
export class CohortService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  private seatsTaken(cohortId: string): Promise<number> {
    return this.prisma.enrollment.count({
      where: { cohortId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
    });
  }

  private async findOwnedCohort(user: CourseActor, cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        course: { select: { id: true, name: true, creatorId: true } },
        ...SCHEDULE_INCLUDE,
      },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (!this.courseAccess.isOwnerOrAdmin(user, cohort.course.creatorId)) {
      throw new ForbiddenException('You can only manage your own cohorts.');
    }
    return cohort;
  }

  /** Admins may fix any cohort; creators only before review starts or after changes are requested. */
  private async findEditableCohort(user: CourseActor, cohortId: string) {
    const cohort = await this.findOwnedCohort(user, cohortId);
    if (
      user.role !== UserRole.ADMIN &&
      !CREATOR_EDITABLE_COHORT_STATUSES.includes(cohort.status)
    ) {
      throw new ForbiddenException(
        cohort.status === CohortStatus.IN_REVIEW
          ? 'This cohort is being reviewed, so it can’t be changed until the review is finished.'
          : 'This cohort can no longer be changed.',
      );
    }
    return cohort;
  }

  async create(user: CourseActor, dto: CreateCohortDto) {
    await this.courseAccess.assertCourseOwner(user, dto.courseId);
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: dto.courseId },
      select: { maxCohortSize: true },
    });
    const dates = {
      startsAt: new Date(dto.startsAt),
      enrollmentClosesAt: new Date(dto.enrollmentClosesAt),
      endsAt: new Date(dto.endsAt),
    };
    assertDatesInOrder(dates);

    return this.prisma.cohort.create({
      data: {
        courseId: dto.courseId,
        name: dto.name.trim(),
        ...dates,
        seatCap: dto.seatCap ?? course.maxCohortSize,
        demoDayAt: toDate(dto.demoDayAt),
      },
      include: SCHEDULE_INCLUDE,
    });
  }

  async update(user: CourseActor, cohortId: string, dto: UpdateCohortDto) {
    const cohort = await this.findEditableCohort(user, cohortId);
    const dates = {
      startsAt: toDate(dto.startsAt) ?? cohort.startsAt,
      enrollmentClosesAt:
        toDate(dto.enrollmentClosesAt) ?? cohort.enrollmentClosesAt,
      endsAt: toDate(dto.endsAt) ?? cohort.endsAt,
    };
    assertDatesInOrder(dates);

    if (dto.seatCap !== undefined) {
      const taken = await this.seatsTaken(cohortId);
      if (dto.seatCap < taken) {
        throw new BadRequestException(
          `${taken} seats are already taken, so the cap can't go below that.`,
        );
      }
    }

    return this.prisma.cohort.update({
      where: { id: cohortId },
      data: {
        name: dto.name?.trim(),
        ...dates,
        seatCap: dto.seatCap,
        demoDayAt: toDate(dto.demoDayAt),
      },
      include: SCHEDULE_INCLUDE,
    });
  }

  /** Replaces the whole module schedule in one go. */
  async setModules(
    user: CourseActor,
    cohortId: string,
    dto: SetCohortModulesDto,
  ) {
    const cohort = await this.findEditableCohort(user, cohortId);
    const moduleIds = dto.modules.map((entry) => entry.moduleId);
    if (new Set(moduleIds).size !== moduleIds.length) {
      throw new BadRequestException('Each module can only be dated once.');
    }
    const owned = await this.prisma.modules.count({
      where: { id: { in: moduleIds }, courseId: cohort.courseId },
    });
    if (owned !== moduleIds.length) {
      throw new BadRequestException(
        "Only this program's modules can be scheduled.",
      );
    }

    await this.prisma.$transaction([
      this.prisma.cohortModule.deleteMany({ where: { cohortId } }),
      this.prisma.cohortModule.createMany({
        data: dto.modules.map((entry) => ({
          cohortId,
          moduleId: entry.moduleId,
          startsAt: new Date(entry.startsAt),
        })),
      }),
    ]);
    return this.prisma.cohort.findUniqueOrThrow({
      where: { id: cohortId },
      include: SCHEDULE_INCLUDE,
    });
  }

  async submitForReview(user: CourseActor, cohortId: string) {
    const cohort = await this.findOwnedCohort(user, cohortId);
    if (
      cohort.status !== CohortStatus.DRAFT &&
      cohort.status !== CohortStatus.CHANGES_REQUESTED
    ) {
      throw new BadRequestException(
        'Only draft cohorts, or ones sent back for changes, can be submitted.',
      );
    }

    const now = new Date();
    if (now > latestSubmitAt(cohort.startsAt)) {
      throw new BadRequestException(
        `Submit at least ${COHORT_REVIEW_LEAD_DAYS} days before the cohort starts. Move the start date to ${formatDateOnly(earliestStartFor(now))} or later.`,
      );
    }

    const modules = await this.prisma.modules.findMany({
      where: { courseId: cohort.courseId },
      orderBy: MODULE_ORDER_BY,
      select: {
        id: true,
        title: true,
        lessonsCount: true,
        _count: { select: { lessons: true } },
      },
    });
    if (!modules.some((module) => module._count.lessons > 0)) {
      throw new BadRequestException(
        'Add at least one lesson to the program before submitting a cohort.',
      );
    }
    const planGaps = describeLessonPlanGaps(modules);
    if (planGaps.length > 0) {
      throw new BadRequestException(
        `Every module needs exactly the number of lessons it was planned with. Fix: ${planGaps.join('; ')}.`,
      );
    }
    const problems = describeScheduleProblems(cohort, modules, cohort.modules);
    if (problems.length > 0) {
      throw new BadRequestException(
        `Fix the schedule: ${problems.join('; ')}.`,
      );
    }

    const updated = await this.prisma.cohort.update({
      where: { id: cohortId },
      data: {
        status: CohortStatus.PENDING_REVIEW,
        submittedAt: now,
        reviewNote: null,
        reviewAttachments: [],
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });
    await this.notifications.createNotifications(
      admins.map((admin) => admin.id),
      `${cohort.course.name}: ${cohort.name}`,
      'A cohort was submitted for review.',
      'cohort-review',
      NOTIFICATION_LINKS.adminCohortReview(cohortId),
    );
    await this.audit.record({
      action: AUDIT_ACTIONS.COHORT_SUBMITTED_FOR_REVIEW,
      targetType: AUDIT_TARGETS.COHORT,
      targetId: cohortId,
      metadata: { previousStatus: cohort.status },
    });
    return updated;
  }

  /** Only empty cohorts can be cancelled; there is no refund flow. */
  async cancel(user: CourseActor, cohortId: string) {
    const cohort = await this.findOwnedCohort(user, cohortId);
    if (cohort.status === CohortStatus.CANCELLED) return cohort;
    if ((await this.seatsTaken(cohortId)) > 0) {
      throw new ConflictException(
        'Learners have already joined this cohort, so it can’t be cancelled.',
      );
    }
    return this.prisma.cohort.update({
      where: { id: cohortId },
      data: { status: CohortStatus.CANCELLED },
    });
  }

  /** Every cohort of a program, for its creator (or an admin). */
  async listForOwner(user: CourseActor, courseId: string) {
    await this.courseAccess.assertCourseOwner(user, courseId);
    const cohorts = await this.prisma.cohort.findMany({
      where: { courseId },
      include: {
        ...SCHEDULE_INCLUDE,
        _count: {
          select: {
            enrollments: {
              where: { status: { in: ENROLLMENT_ACCESS_STATUSES } },
            },
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });
    return cohorts.map(({ _count, ...cohort }) => ({
      ...cohort,
      seatsTaken: _count.enrollments,
    }));
  }

  /** Approved cohorts learners can buy: open ones with seats left, plus ended ones as rewatches. */
  async listForSale(courseId: string) {
    const now = new Date();
    const cohorts = await this.prisma.cohort.findMany({
      where: { courseId, status: CohortStatus.APPROVED },
      select: {
        id: true,
        name: true,
        startsAt: true,
        enrollmentClosesAt: true,
        endsAt: true,
        seatCap: true,
        demoDayAt: true,
        modules: { select: { moduleId: true, startsAt: true } },
        _count: {
          select: {
            enrollments: {
              where: { status: { in: ENROLLMENT_ACCESS_STATUSES } },
            },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    return cohorts
      .map(({ _count, seatCap, ...cohort }) => {
        const phase = cohortSalesPhase(cohort, now);
        return {
          ...cohort,
          phase,
          // Rewatches have no seat cap.
          seatsLeft:
            phase === 'REWATCH'
              ? null
              : Math.max(seatCap - _count.enrollments, 0),
        };
      })
      .filter((cohort) => cohort.phase !== 'CLOSED');
  }
}
