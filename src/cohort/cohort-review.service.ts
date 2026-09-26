import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { NOTIFICATION_LINKS } from '../notification/notification-links';
import { CohortStatus, CourseStatus } from '../generated/prisma/client';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import { ReviewCohortDto } from './dto/review-cohort.dto';

const COURSE_SUMMARY = {
  select: {
    id: true,
    name: true,
    creator: { select: { id: true, name: true, email: true } },
  },
} as const;

/** Admin review of cohorts: the queue, the full review page, and the decision. */
@Injectable()
export class CohortReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  listQueue(status: CohortStatus = CohortStatus.PENDING_REVIEW) {
    return this.prisma.cohort.findMany({
      where: { status },
      include: { course: COURSE_SUMMARY },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Everything the review page shows: the schedule and the whole program. */
  async getForReview(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        modules: { select: { moduleId: true, startsAt: true } },
        course: {
          select: {
            ...COURSE_SUMMARY.select,
            shortDescription: true,
            fullDescription: true,
            heroImageName: true,
            tuitionFee: true,
            modules: {
              orderBy: MODULE_ORDER_BY,
              select: {
                id: true,
                title: true,
                description: true,
                lessons: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    contentType: true,
                    duration: true,
                    videoUrl: true,
                    content: true,
                  },
                },
                assignments: {
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    questions: true,
                    maxScore: true,
                    publishedAt: true,
                  },
                },
              },
            },
            projects: {
              select: {
                id: true,
                title: true,
                description: true,
                milestones: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    return cohort;
  }

  /** The status guard makes two admins clicking at once safe: only one transition wins. */
  async startReview(cohortId: string) {
    const { count } = await this.prisma.cohort.updateMany({
      where: { id: cohortId, status: CohortStatus.PENDING_REVIEW },
      data: { status: CohortStatus.IN_REVIEW },
    });
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { course: { select: { name: true, creatorId: true } } },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (count === 0) {
      throw new BadRequestException(
        'Only cohorts pending review can be moved into review.',
      );
    }

    if (cohort.course.creatorId) {
      await this.notifications.createNotification(
        cohort.course.creatorId,
        `${cohort.course.name}: ${cohort.name}`,
        'An admin started reviewing your cohort. Editing is paused until the review is finished.',
        'cohort-review',
        NOTIFICATION_LINKS.creatorPrograms(),
      );
    }
    await this.audit.record({
      action: AUDIT_ACTIONS.COHORT_REVIEW_STARTED,
      targetType: AUDIT_TARGETS.COHORT,
      targetId: cohortId,
    });
    return { id: cohort.id, status: cohort.status };
  }

  async review(cohortId: string, dto: ReviewCohortDto) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { course: { select: { name: true, creatorId: true } } },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (cohort.status !== CohortStatus.IN_REVIEW) {
      throw new BadRequestException(
        'Start the review before approving or requesting changes.',
      );
    }

    if (dto.approved) {
      // The program is listed and sellable once any of its cohorts is approved.
      await this.prisma.course.update({
        where: { id: cohort.courseId },
        data: { status: CourseStatus.ACTIVE },
      });
    }
    const updated = await this.prisma.cohort.update({
      where: { id: cohortId },
      data: dto.approved
        ? {
            status: CohortStatus.APPROVED,
            reviewNote: null,
            reviewAttachments: [],
          }
        : {
            status: CohortStatus.CHANGES_REQUESTED,
            reviewNote: dto.reason,
            reviewAttachments: dto.attachmentUrls ?? [],
          },
    });

    if (cohort.course.creatorId) {
      await this.notifications.createNotification(
        cohort.course.creatorId,
        `${cohort.course.name}: ${cohort.name}`,
        dto.approved
          ? 'Your cohort was approved and is now open for enrollment.'
          : `Your cohort needs changes: ${dto.reason}`,
        'cohort-review',
        NOTIFICATION_LINKS.creatorPrograms(),
      );
    }
    await this.audit.record({
      action: dto.approved
        ? AUDIT_ACTIONS.COHORT_APPROVED
        : AUDIT_ACTIONS.COHORT_CHANGES_REQUESTED,
      targetType: AUDIT_TARGETS.COHORT,
      targetId: cohortId,
      metadata: dto.approved
        ? {}
        : {
            reason: dto.reason ?? null,
            attachmentsCount: updated.reviewAttachments.length,
          },
    });
    return updated;
  }
}
