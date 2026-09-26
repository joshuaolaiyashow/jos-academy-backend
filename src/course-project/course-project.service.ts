import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CourseProjectStatus } from '../generated/prisma/client';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';
import { CreateCourseProjectDto } from './dto/create-course-project.dto';
import { SubmitMilestoneDto } from './dto/submit-milestone.dto';
import { UpdateCourseProjectDto } from './dto/update-course-project.dto';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

type ProjectActor = CourseActor & { name: string };

const USER_SUMMARY = { select: { id: true, name: true, email: true } } as const;

@Injectable()
export class CourseProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly notifications: NotificationService,
  ) {}

  private async findOwnedProject(user: CourseActor, projectId: string) {
    const project = await this.prisma.courseProject.findUnique({
      where: { id: projectId },
      include: { course: { select: { creatorId: true, status: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (!this.courseAccess.isOwnerOrAdmin(user, project.course.creatorId)) {
      throw new ForbiddenException('You can only manage your own projects.');
    }
    return project;
  }

  async create(user: CourseActor, dto: CreateCourseProjectDto) {
    // Projects run alongside the cohort, so any program status is fine; only
    // assignments and the curriculum are frozen by review and approval.
    await this.courseAccess.assertCourseOwner(user, dto.courseId);
    return this.prisma.courseProject.create({
      data: {
        courseId: dto.courseId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        milestones: dto.milestones.map((milestone) => milestone.trim()),
      },
    });
  }

  async update(
    user: CourseActor,
    projectId: string,
    dto: UpdateCourseProjectDto,
  ) {
    await this.findOwnedProject(user, projectId);
    return this.prisma.courseProject.update({
      where: { id: projectId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        status: dto.status,
      },
    });
  }

  async listForCreator(user: CourseActor) {
    const projects = await this.prisma.courseProject.findMany({
      where: { course: { creatorId: user.id } },
      include: {
        course: { select: { id: true, name: true } },
        submissions: { select: { milestoneIndex: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      projects: await Promise.all(
        projects.map(async ({ submissions, course, ...project }) => {
          const enrolled = await this.prisma.enrollment.count({
            where: {
              courseId: course.id,
              status: { in: ENROLLMENT_ACCESS_STATUSES },
            },
          });
          return {
            ...project,
            courseName: course.name,
            totalSubmissions: submissions.length,
            stages: project.milestones.map((label, index) => ({
              label,
              completedCount: submissions.filter(
                (entry) => entry.milestoneIndex === index,
              ).length,
              totalCount: enrolled,
            })),
          };
        }),
      ),
    };
  }

  async listSubmissions(user: CourseActor, projectId: string) {
    await this.findOwnedProject(user, projectId);
    const submissions = await this.prisma.projectMilestoneSubmission.findMany({
      where: { projectId },
      include: { user: USER_SUMMARY },
      orderBy: [{ milestoneIndex: 'asc' }, { submittedAt: 'desc' }],
    });
    return {
      submissions: submissions.map(({ user: student, ...submission }) => ({
        ...submission,
        student,
      })),
    };
  }

  async listForLearner(user: CourseActor, courseId: string) {
    const access = await this.courseAccess.getModuleAccess(user, courseId);
    const projects = await this.prisma.courseProject.findMany({
      where: { courseId, status: { not: CourseProjectStatus.ARCHIVED } },
      include: {
        submissions: {
          where: { userId: user.id },
          select: {
            milestoneIndex: true,
            url: true,
            notes: true,
            submittedAt: true,
          },
          orderBy: { milestoneIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const cohortId = await this.courseAccess.learnerCohortId(user, courseId);
    const cohort = cohortId
      ? await this.prisma.cohort.findUnique({
          where: { id: cohortId },
          select: { demoDayAt: true },
        })
      : null;
    return {
      isReadOnly: access.isReadOnly,
      /** Demo day belongs to the learner's cohort, not to a project. */
      demoDay: cohort?.demoDayAt ?? null,
      projects: projects.map(({ submissions, ...project }) => ({
        ...project,
        mySubmissions: submissions,
      })),
    };
  }

  /** Milestones are submitted in order; resubmitting an earlier one is allowed. */
  async submitMilestone(
    user: ProjectActor,
    projectId: string,
    milestoneIndex: number,
    dto: SubmitMilestoneDto,
  ) {
    const project = await this.prisma.courseProject.findUnique({
      where: { id: projectId },
      include: { course: { select: { creatorId: true, name: true } } },
    });
    if (!project || project.status === CourseProjectStatus.ARCHIVED) {
      throw new NotFoundException('Project not found');
    }
    const access = await this.courseAccess.getModuleAccess(
      user,
      project.courseId,
    );
    this.courseAccess.assertAcceptsCoursework(access);

    if (milestoneIndex < 0 || milestoneIndex >= project.milestones.length) {
      throw new BadRequestException('That milestone does not exist.');
    }
    if (project.status === CourseProjectStatus.COMPLETED) {
      throw new ConflictException('This project is closed for submissions.');
    }
    if (milestoneIndex > 0) {
      const previous = await this.prisma.projectMilestoneSubmission.findUnique({
        where: {
          projectId_userId_milestoneIndex: {
            projectId,
            userId: user.id,
            milestoneIndex: milestoneIndex - 1,
          },
        },
      });
      if (!previous) {
        throw new ConflictException(
          `Submit "${project.milestones[milestoneIndex - 1]}" first.`,
        );
      }
    }

    const notes = dto.notes?.trim() || null;
    const submission = await this.prisma.projectMilestoneSubmission.upsert({
      where: {
        projectId_userId_milestoneIndex: {
          projectId,
          userId: user.id,
          milestoneIndex,
        },
      },
      create: {
        projectId,
        userId: user.id,
        milestoneIndex,
        url: dto.url,
        notes,
      },
      update: { url: dto.url, notes, submittedAt: new Date() },
    });

    const creatorId = project.course.creatorId;
    if (creatorId && creatorId !== user.id) {
      await this.notifications.createNotification(
        creatorId,
        `${user.name} submitted "${project.milestones[milestoneIndex]}"`,
        `${project.title} in ${project.course.name}.`,
        'project-milestone-submitted',
        NOTIFICATION_LINKS.creatorProjects(),
      );
    }
    return submission;
  }
}
