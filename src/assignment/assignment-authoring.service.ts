import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentSubmissionStatus } from '../generated/prisma/client';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';
import {
  CODING_EXERCISE,
  MIN_CHOICE_OPTIONS,
  MULTIPLE_CHOICE,
} from './assignment.constants';
import type { AssignmentStatus, StoredQuestion } from './assignment.types';
import {
  AssignmentQuestionDto,
  CreateAssignmentDto,
} from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

export const deriveAssignmentStatus = (assignment: {
  publishedAt: Date | null;
}): AssignmentStatus => (assignment.publishedAt ? 'active' : 'upcoming');

const toStoredQuestions = (
  questions: AssignmentQuestionDto[],
): StoredQuestion[] => {
  const ids = new Set(questions.map((question) => question.id));
  if (ids.size !== questions.length) {
    throw new BadRequestException('Each question needs a unique id.');
  }
  return questions.map((question) => {
    const options = (question.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      question.responseType === MULTIPLE_CHOICE &&
      new Set(options).size < MIN_CHOICE_OPTIONS
    ) {
      throw new BadRequestException(
        `"${question.question}" needs at least ${MIN_CHOICE_OPTIONS} different options.`,
      );
    }
    const isCoding = question.responseType === CODING_EXERCISE;
    if (isCoding && !question.codeLanguage) {
      throw new BadRequestException(
        `Pick a language for the coding exercise "${question.question}".`,
      );
    }
    return {
      id: question.id,
      question: question.question.trim(),
      responseType: question.responseType,
      description: question.description?.trim() || undefined,
      options: question.responseType === MULTIPLE_CHOICE ? options : undefined,
      codeLanguage: isCoding ? question.codeLanguage : undefined,
      // Starter code keeps its whitespace; indentation is part of the code.
      starterCode: isCoding ? question.starterCode || undefined : undefined,
    };
  });
};

/** Creator-side assignment management: create, edit, publish, and list with real counts. */
@Injectable()
export class AssignmentAuthoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  /** Loads an assignment and confirms the caller owns its program. */
  async findOwnedAssignment(user: CourseActor, assignmentId: string) {
    const assignment = await this.prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: { module: { include: { course: true } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (
      !this.courseAccess.isOwnerOrAdmin(
        user,
        assignment.module.course.creatorId,
      )
    ) {
      throw new ForbiddenException('You can only manage your own assignments.');
    }
    return assignment;
  }

  /** Like findOwnedAssignment, but also refuses programs in review or live. */
  private async findEditableAssignment(
    user: CourseActor,
    assignmentId: string,
  ) {
    const assignment = await this.findOwnedAssignment(user, assignmentId);
    this.courseAccess.assertCourseEditable(user, assignment.module.course);
    return assignment;
  }

  async create(user: CourseActor, dto: CreateAssignmentDto) {
    const module = await this.prisma.modules.findUnique({
      where: { id: dto.moduleId },
      select: { courseId: true },
    });
    if (!module) throw new NotFoundException('Module not found');
    await this.courseAccess.assertCanEditCourse(user, module.courseId);

    return this.prisma.assignments.create({
      data: {
        moduleId: dto.moduleId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        maxScore: dto.maxScore,
        questions: toStoredQuestions(dto.questions),
        publishedAt: dto.publish ? new Date() : null,
      },
    });
  }

  async update(
    user: CourseActor,
    assignmentId: string,
    dto: UpdateAssignmentDto,
  ) {
    await this.findEditableAssignment(user, assignmentId);
    return this.prisma.assignments.update({
      where: { id: assignmentId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
      },
    });
  }

  async publish(user: CourseActor, assignmentId: string) {
    const assignment = await this.findEditableAssignment(user, assignmentId);
    if (assignment.publishedAt) return assignment;
    return this.prisma.assignments.update({
      where: { id: assignmentId },
      data: { publishedAt: new Date() },
      include: { module: { include: { course: true } } },
    });
  }

  /** Learners who can open a module: full-course enrollees plus those who bought that module. */
  private countEligibleLearners(courseId: string, moduleId: string) {
    return this.prisma.enrollment.count({
      where: {
        courseId,
        status: { in: ENROLLMENT_ACCESS_STATUSES },
        OR: [
          { type: 'FULL_COURSE' },
          { enrolledModules: { some: { moduleId } } },
        ],
      },
    });
  }

  async listForCreator(user: CourseActor) {
    const assignments = await this.prisma.assignments.findMany({
      where: { module: { course: { creatorId: user.id } } },
      include: {
        module: { include: { course: { select: { id: true, name: true } } } },
        submissions: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      assignments: await Promise.all(
        assignments.map(async ({ submissions, module, ...assignment }) => {
          const graded = submissions.filter(
            (submission) =>
              submission.status === AssignmentSubmissionStatus.GRADED,
          ).length;
          const eligible = await this.countEligibleLearners(
            module.course.id,
            module.id,
          );
          return {
            ...assignment,
            moduleTitle: module.title,
            courseId: module.course.id,
            courseName: module.course.name,
            status: deriveAssignmentStatus(assignment),
            submitted: submissions.length,
            graded,
            pending: submissions.length - graded,
            notSubmitted: Math.max(0, eligible - submissions.length),
          };
        }),
      ),
    };
  }
}
