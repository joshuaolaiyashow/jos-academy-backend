import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { CohortStatus } from '../generated/prisma/client';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';

/** Who is in a cohort, and moving a learner between cohorts of the same program. */
@Injectable()
export class CohortRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly audit: AuditService,
  ) {}

  async roster(user: CourseActor, cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        name: true,
        seatCap: true,
        course: { select: { creatorId: true } },
      },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (!this.courseAccess.isOwnerOrAdmin(user, cohort.course.creatorId)) {
      throw new ForbiddenException('You can only see your own cohorts.');
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { cohortId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        enrolledModules: { select: { moduleId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const attendance = await this.prisma.sessionAttendance.groupBy({
      by: ['userId'],
      where: {
        session: { cohortId },
        userId: { in: enrollments.map((entry) => entry.user.id) },
      },
      _count: { _all: true },
    });
    const attendedByUser = new Map(
      attendance.map((entry) => [entry.userId, entry._count._all]),
    );

    return {
      id: cohort.id,
      name: cohort.name,
      seatCap: cohort.seatCap,
      learners: enrollments.map(
        ({ enrolledModules, user: learner, ...rest }) => ({
          ...rest,
          learner,
          moduleIds: enrolledModules.map((entry) => entry.moduleId),
          sessionsAttended: attendedByUser.get(learner.id) ?? 0,
        }),
      ),
    };
  }

  /** Admin only. The target must be an approved cohort of the same program with a free seat. */
  async transfer(enrollmentId: string, targetCohortId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, courseId: true, cohortId: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.cohortId === targetCohortId) {
      throw new BadRequestException('The learner is already in that cohort.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Cohort" WHERE id = ${targetCohortId} FOR UPDATE`;
      const target = await tx.cohort.findFirst({
        where: {
          id: targetCohortId,
          courseId: enrollment.courseId,
          status: CohortStatus.APPROVED,
        },
        select: { seatCap: true, endsAt: true },
      });
      if (!target) {
        throw new BadRequestException(
          'Move learners only to an approved cohort of the same program.',
        );
      }
      const taken = await tx.enrollment.count({
        where: {
          cohortId: targetCohortId,
          status: { in: ENROLLMENT_ACCESS_STATUSES },
        },
      });
      // Ended cohorts sell as uncapped rewatches, so only live cohorts can be full.
      if (target.endsAt > new Date() && taken >= target.seatCap) {
        throw new ConflictException('That cohort is full.');
      }

      const moved = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { cohortId: targetCohortId },
        select: { id: true, cohortId: true },
      });
      await this.audit.record({
        action: AUDIT_ACTIONS.ENROLLMENT_TRANSFERRED,
        targetType: AUDIT_TARGETS.ENROLLMENT,
        targetId: enrollmentId,
        metadata: { from: enrollment.cohortId, to: targetCohortId },
      });
      return moved;
    });
  }
}
