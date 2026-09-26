import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CohortStatus,
  EnrollmentStatus,
  EnrollmentType,
  UserRole,
} from '../generated/prisma/client';
import { hasEnrollmentAccess } from '../enrollment/enrollment-access';
import { contentLockingCohortsWhere } from '../cohort/cohort-phase';

export type CourseActor = { id: string; role: UserRole };

type LockableCourse = { id: string; creatorId: string | null };

const LOCKED_BY_COHORT_MESSAGES: Partial<Record<CohortStatus, string>> = {
  [CohortStatus.IN_REVIEW]:
    'A cohort of this program is being reviewed, so its content can’t change until the review is finished.',
  [CohortStatus.APPROVED]:
    'A cohort of this program is approved or running, so its content can’t change until that cohort ends.',
};

/**
 * Which of a course's modules a user may open: all, or a specific set.
 * `isReadOnly` is set for a learner who has finished the course: they keep
 * reading lessons and joining discussions, but coursework is closed.
 */
export type ModuleAccess = { isReadOnly: boolean } & (
  { allModules: true } | { allModules: false; moduleIds: Set<string> }
);

const COMPLETED_COURSE_READ_ONLY_MESSAGE =
  'You have completed this program, so assignments and projects are closed. You can still read the lessons and join discussions.';

@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private async findCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, creatorId: true, status: true },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }
    return course;
  }

  isOwnerOrAdmin(user: CourseActor, creatorId: string | null): boolean {
    return user.role === UserRole.ADMIN || creatorId === user.id;
  }

  /** The course's creator, or an admin. */
  async assertCourseOwner(user: CourseActor, courseId: string): Promise<void> {
    const course = await this.findCourse(courseId);
    if (!this.isOwnerOrAdmin(user, course.creatorId)) {
      throw new ForbiddenException('You can only manage your own programs.');
    }
  }

  /**
   * The owner (or an admin) may change the course, and — for everyone but
   * admins — only while no cohort freezes it (in review, or approved and not yet ended).
   */
  async assertCourseEditable(
    user: CourseActor,
    course: LockableCourse,
  ): Promise<void> {
    if (!this.isOwnerOrAdmin(user, course.creatorId)) {
      throw new ForbiddenException('You can only manage your own programs.');
    }
    if (user.role === UserRole.ADMIN) return;
    const lockingCohort = await this.prisma.cohort.findFirst({
      where: contentLockingCohortsWhere(course.id, new Date()),
      select: { status: true },
    });
    if (lockingCohort) {
      throw new ForbiddenException(
        LOCKED_BY_COHORT_MESSAGES[lockingCohort.status],
      );
    }
  }

  async assertCanEditCourse(user: CourseActor, courseId: string) {
    const course = await this.findCourse(courseId);
    await this.assertCourseEditable(user, course);
    return course;
  }

  /** Loads a module and applies the course edit lock to it. */
  async findEditableModule(user: CourseActor, moduleId: string) {
    const module = await this.prisma.modules.findUnique({
      where: { id: moduleId },
      include: {
        course: { select: { id: true, creatorId: true, status: true } },
      },
    });
    if (!module) {
      throw new NotFoundException(`Module with ID "${moduleId}" not found`);
    }
    await this.assertCourseEditable(user, module.course);
    return module;
  }

  /** Loads a lesson and applies the course edit lock to it. */
  async findEditableLesson(user: CourseActor, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: { select: { id: true, creatorId: true, status: true } },
          },
        },
      },
    });
    if (!lesson) {
      throw new NotFoundException(`Lesson with ID "${lessonId}" not found`);
    }
    await this.assertCourseEditable(user, lesson.module.course);
    return lesson;
  }

  /**
   * Owners and admins see every module; learners see the modules their
   * (active or completed) enrollment unlocks. Anyone else is refused.
   */
  async getModuleAccess(
    user: CourseActor,
    courseId: string,
  ): Promise<ModuleAccess> {
    const course = await this.findCourse(courseId);
    if (this.isOwnerOrAdmin(user, course.creatorId))
      return { allModules: true, isReadOnly: false };

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
      include: { enrolledModules: { select: { moduleId: true } } },
    });
    if (!enrollment || !hasEnrollmentAccess(enrollment.status)) {
      throw new ForbiddenException('Enroll in this program to continue.');
    }
    const isReadOnly = enrollment.status === EnrollmentStatus.COMPLETED;
    if (enrollment.type === EnrollmentType.FULL_COURSE)
      return { allModules: true, isReadOnly };
    return {
      allModules: false,
      isReadOnly,
      moduleIds: new Set(
        enrollment.enrolledModules.map((entry) => entry.moduleId),
      ),
    };
  }

  async assertCourseMember(user: CourseActor, courseId: string): Promise<void> {
    await this.getModuleAccess(user, courseId);
  }

  /** The learner's cohort in a program; null for owners, admins and pre-cohort enrollments. */
  async learnerCohortId(
    user: CourseActor,
    courseId: string,
  ): Promise<string | null> {
    const course = await this.findCourse(courseId);
    if (this.isOwnerOrAdmin(user, course.creatorId)) return null;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
      select: { cohortId: true },
    });
    return enrollment?.cohortId ?? null;
  }

  /** Cohort sessions are for that cohort's learners; sessions without a cohort, for every member. */
  async assertCohortMember(
    user: CourseActor,
    courseId: string,
    cohortId: string | null,
  ): Promise<void> {
    await this.assertCourseMember(user, courseId);
    if (!cohortId) return;
    const course = await this.findCourse(courseId);
    if (this.isOwnerOrAdmin(user, course.creatorId)) return;
    if ((await this.learnerCohortId(user, courseId)) !== cohortId) {
      throw new ForbiddenException('This session is for another cohort.');
    }
  }

  assertAcceptsCoursework(access: ModuleAccess): void {
    if (access.isReadOnly) {
      throw new ConflictException(COMPLETED_COURSE_READ_ONLY_MESSAGE);
    }
  }

  canOpenModule(access: ModuleAccess, moduleId: string): boolean {
    return access.allModules || access.moduleIds.has(moduleId);
  }
}
