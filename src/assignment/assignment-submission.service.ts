import 'multer';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { NotificationService } from '../notification/notification.service';
import { AssignmentSubmissionStatus, Prisma } from '../generated/prisma/client';
import {
  CourseAccessService,
  type CourseActor,
} from '../course-access/course-access.service';
import {
  ALLOWED_ANSWER_FILE_TYPES,
  FILE_UPLOAD,
  MULTIPLE_CHOICE,
  submissionFilePrefix,
  UNTITLED_ASSIGNMENT,
} from './assignment.constants';
import type { StoredAnswer, StoredQuestion } from './assignment.types';
import {
  AssignmentAuthoringService,
  deriveAssignmentStatus,
} from './assignment-authoring.service';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { isUniqueViolation } from '../utils';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

type SubmissionActor = CourseActor & { name: string };

const questionsOf = (assignment: { questions: Prisma.JsonValue }) =>
  assignment.questions as unknown as StoredQuestion[];

/**
 * Every question must be answered in the form its type asks for; file answers
 * may only point at files this learner uploaded for this assignment.
 */
const validateAnswers = (
  questions: StoredQuestion[],
  dto: SubmitAssignmentDto,
  filePrefix: string,
): StoredAnswer[] => {
  const byQuestion = new Map(
    dto.answers.map((answer) => [answer.questionId, answer]),
  );

  return questions.map((question) => {
    const answer = byQuestion.get(question.id);
    const missing = new BadRequestException(`Answer "${question.question}".`);
    if (!answer) throw missing;

    if (question.responseType === FILE_UPLOAD) {
      if (!answer.fileKey || !answer.fileName) throw missing;
      if (!answer.fileKey.startsWith(filePrefix)) {
        throw new BadRequestException(
          'That file was not uploaded for this assignment.',
        );
      }
      return {
        questionId: question.id,
        fileKey: answer.fileKey,
        fileName: answer.fileName,
      };
    }
    if (question.responseType === MULTIPLE_CHOICE) {
      if (!answer.choice || !question.options?.includes(answer.choice)) {
        throw new BadRequestException(
          `Pick one of the options for "${question.question}".`,
        );
      }
      return { questionId: question.id, choice: answer.choice };
    }
    const text = answer.text?.trim();
    if (!text) throw missing;
    return { questionId: question.id, text };
  });
};

@Injectable()
export class AssignmentSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly authoring: AssignmentAuthoringService,
    private readonly fileUpload: FileUploadService,
    private readonly notifications: NotificationService,
  ) {}

  /** Swaps stored file keys for short-lived signed download links. */
  private async withFileUrls(answers: Prisma.JsonValue) {
    return Promise.all(
      (answers as unknown as StoredAnswer[]).map(
        async ({ fileKey, ...answer }) => ({
          ...answer,
          fileUrl: fileKey
            ? await this.fileUpload.getPresignedUrl(fileKey)
            : null,
        }),
      ),
    );
  }

  /** A published assignment in a module the learner can open (owners always pass). */
  private async findOpenAssignment(user: CourseActor, assignmentId: string) {
    const assignment = await this.prisma.assignments.findUnique({
      where: { id: assignmentId },
      include: {
        module: {
          include: {
            course: { select: { id: true, name: true, creatorId: true } },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const access = await this.courseAccess.getModuleAccess(
      user,
      assignment.module.courseId,
    );
    if (!this.courseAccess.canOpenModule(access, assignment.moduleId)) {
      throw new NotFoundException('Assignment not found');
    }
    const isOwner = this.courseAccess.isOwnerOrAdmin(
      user,
      assignment.module.course.creatorId,
    );
    if (!assignment.publishedAt && !isOwner) {
      throw new NotFoundException('Assignment not found');
    }
    return { assignment, access };
  }

  async listForLearner(user: CourseActor, courseId: string) {
    const access = await this.courseAccess.getModuleAccess(user, courseId);
    const assignments = await this.prisma.assignments.findMany({
      where: { module: { courseId }, publishedAt: { not: null } },
      include: {
        module: { select: { id: true, title: true } },
        submissions: {
          where: { userId: user.id },
          select: { status: true, score: true, submittedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      isReadOnly: access.isReadOnly,
      assignments: assignments
        .filter((assignment) =>
          this.courseAccess.canOpenModule(access, assignment.moduleId),
        )
        .map(({ submissions, module, questions, ...assignment }) => ({
          id: assignment.id,
          title: assignment.title,
          maxScore: assignment.maxScore,
          moduleId: module.id,
          moduleTitle: module.title,
          questionCount: (questions as unknown as StoredQuestion[]).length,
          status: deriveAssignmentStatus(assignment),
          mySubmission: submissions[0] ?? null,
        })),
    };
  }

  async getForLearner(user: CourseActor, assignmentId: string) {
    const { assignment, access } = await this.findOpenAssignment(
      user,
      assignmentId,
    );
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId: user.id } },
    });

    return {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      maxScore: assignment.maxScore,
      isReadOnly: access.isReadOnly,
      questions: questionsOf(assignment),
      moduleTitle: assignment.module.title,
      courseId: assignment.module.course.id,
      courseName: assignment.module.course.name,
      mySubmission: submission
        ? {
            id: submission.id,
            status: submission.status,
            score: submission.score,
            feedback: submission.feedback,
            notes: submission.notes,
            submittedAt: submission.submittedAt,
            gradedAt: submission.gradedAt,
            answers: await this.withFileUrls(submission.answers),
          }
        : null,
    };
  }

  async uploadAnswerFile(
    user: CourseActor,
    assignmentId: string,
    file: Express.Multer.File,
  ) {
    const { access } = await this.findOpenAssignment(user, assignmentId);
    this.courseAccess.assertAcceptsCoursework(access);
    if (!file) throw new BadRequestException('Choose a file to upload.');
    if (!ALLOWED_ANSWER_FILE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Upload a PDF, Office document, image, text/CSV or ZIP file.',
      );
    }

    const folder = submissionFilePrefix(assignmentId, user.id).replace(
      /\/$/,
      '',
    );
    const uploaded = await this.fileUpload.uploadFile(file, folder, {
      asAttachment: true,
    });
    return { fileKey: uploaded.key, fileName: file.originalname };
  }

  async submit(
    user: SubmissionActor,
    assignmentId: string,
    dto: SubmitAssignmentDto,
  ) {
    const { assignment, access } = await this.findOpenAssignment(
      user,
      assignmentId,
    );
    this.courseAccess.assertAcceptsCoursework(access);
    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        AssignmentSubmissionService.ALREADY_SUBMITTED,
      );
    }

    const answers = validateAnswers(
      questionsOf(assignment),
      dto,
      submissionFilePrefix(assignmentId, user.id),
    ) as unknown as Prisma.InputJsonValue;
    const notes = dto.notes?.trim() || null;

    const submission = await this.createSubmission(assignmentId, user.id, {
      answers,
      notes,
    });

    const creatorId = assignment.module.course.creatorId;
    if (creatorId && creatorId !== user.id) {
      await this.notifications.createNotification(
        creatorId,
        `New submission from ${user.name}`,
        `"${assignment.title}" in ${assignment.module.course.name}.`,
        'assignment-submitted',
        NOTIFICATION_LINKS.creatorAssignments(),
      );
    }
    return submission;
  }

  /** Submissions are final: once sent, answers can't be changed. */
  private static readonly ALREADY_SUBMITTED =
    'You have already submitted this assignment. Submissions cannot be edited.';

  /** A double-clicked first submission hits the unique index instead of creating two rows. */
  private async createSubmission(
    assignmentId: string,
    userId: string,
    data: {
      answers: Prisma.InputJsonValue;
      notes: string | null;
    },
  ) {
    try {
      return await this.prisma.assignmentSubmission.create({
        data: { assignmentId, userId, ...data },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          AssignmentSubmissionService.ALREADY_SUBMITTED,
        );
      }
      throw error;
    }
  }

  async listSubmissions(user: CourseActor, assignmentId: string) {
    await this.authoring.findOwnedAssignment(user, assignmentId);
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { submittedAt: 'desc' },
    });

    return {
      submissions: await Promise.all(
        submissions.map(async ({ user: student, answers, ...submission }) => ({
          ...submission,
          student,
          answers: await this.withFileUrls(answers),
        })),
      ),
    };
  }

  async grade(
    user: CourseActor,
    submissionId: string,
    dto: GradeSubmissionDto,
  ) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    const assignment = await this.authoring.findOwnedAssignment(
      user,
      submission.assignmentId,
    );
    if (dto.score > assignment.maxScore) {
      throw new BadRequestException(
        `The score can't be more than ${assignment.maxScore}.`,
      );
    }

    const graded = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: dto.score,
        feedback: dto.feedback.trim(),
        status: AssignmentSubmissionStatus.GRADED,
        gradedAt: new Date(),
      },
    });
    await this.notifications.createNotification(
      submission.userId,
      'Assignment graded',
      `"${assignment.title}": ${dto.score}/${assignment.maxScore}.`,
      'assignment-graded',
      NOTIFICATION_LINKS.assignment(
        assignment.module.course.id,
        submission.assignmentId,
      ),
    );
    await this.notifications.sendAssignmentGradedEmail({
      userId: submission.userId,
      assignmentTitle: assignment.title ?? UNTITLED_ASSIGNMENT,
      courseId: assignment.module.course.id,
      courseName: assignment.module.course.name,
      score: dto.score,
      maxScore: assignment.maxScore,
    });
    return graded;
  }
}
