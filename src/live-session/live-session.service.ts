import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { UpdateLiveSessionStatusDto } from './dto/update-live-session-status.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto';
import {
  AttendanceStatus,
  CohortStatus,
  LiveSessionStatus,
  UserRole,
} from '../generated/prisma/client';
import { CourseAccessService } from '../course-access/course-access.service';
import { NotificationService } from '../notification/notification.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';

type SessionActor = { id: string; role: UserRole };

@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly notifications: NotificationService,
  ) {}

  /** Meeting links are only ever handed out by joinSession or to the owner. */
  private readonly publicSessionOmit = {
    meetingLink: true,
    recordingUrl: true,
  } as const;

  private readonly sessionListSelect = {
    creator: { select: { id: true, name: true } },
    course: { select: { id: true, name: true } },
    _count: { select: { attendance: true } },
  };

  private mapSessionWithAttendeeCount<
    T extends { _count: { attendance: number } },
  >(session: T) {
    const { _count, ...rest } = session;
    return { ...rest, attendeeCount: _count.attendance };
  }

  /**
   * Create a new live session, validating course/module ownership
   */
  async createLiveSession(creator: SessionActor, dto: CreateLiveSessionDto) {
    const { courseId, moduleId, cohortId, ...sessionData } = dto;
    const creatorId = creator.id;

    // Sessions are how a cohort is taught, so they're allowed in any program status;
    // only the curriculum is frozen by review and approval.
    await this.courseAccess.assertCourseOwner(creator, courseId);

    if (moduleId) {
      const module = await this.prisma.modules.findUnique({
        where: { id: moduleId },
      });
      if (!module || module.courseId !== courseId) {
        throw new BadRequestException(
          `Module with ID "${moduleId}" does not belong to course "${courseId}"`,
        );
      }
    }

    await this.assertCohortForSession(courseId, cohortId);

    const session = await this.prisma.liveSession.create({
      data: {
        ...sessionData,
        scheduledAt: new Date(sessionData.scheduledAt),
        courseId,
        moduleId: moduleId || undefined,
        cohortId,
        creatorId,
      },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `📅 Live session created: "${session.title}" (ID: ${session.id})`,
    );

    const learners = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        status: { in: ENROLLMENT_ACCESS_STATUSES },
        ...(cohortId ? { cohortId } : {}),
      },
      select: { userId: true },
    });
    await this.notifications.sendLiveSessionScheduledEmails({
      userIds: learners.map((learner) => learner.userId),
      sessionTitle: session.title,
      courseId,
      courseName: session.course.name,
      scheduledAt: session.scheduledAt,
    });
    return {
      message: 'Live session created successfully',
      session,
    };
  }

  /**
   * Get all live sessions, optionally filtered by courseId
   */
  async getLiveSessions(courseId?: string) {
    const sessions = await this.prisma.liveSession.findMany({
      where: courseId ? { courseId } : {},
      omit: this.publicSessionOmit,
      include: this.sessionListSelect,
      orderBy: { scheduledAt: 'asc' },
    });

    return {
      total: sessions.length,
      sessions: sessions.map((session) =>
        this.mapSessionWithAttendeeCount(session),
      ),
    };
  }

  /**
   * The caller's own cohort's sessions, with recordings. Owners and admins see
   * every session of the program.
   */
  async getCohortSessions(courseId: string, user: SessionActor) {
    await this.courseAccess.assertCourseMember(user, courseId);
    const cohortId = await this.courseAccess.learnerCohortId(user, courseId);
    const sessions = await this.prisma.liveSession.findMany({
      where: { courseId, ...(cohortId ? { cohortId } : {}) },
      omit: { meetingLink: true },
      include: this.sessionListSelect,
      orderBy: { scheduledAt: 'asc' },
    });
    return {
      total: sessions.length,
      sessions: sessions.map((session) =>
        this.mapSessionWithAttendeeCount(session),
      ),
    };
  }

  /** Once a program has cohorts, every session must belong to one of them. */
  private async assertCohortForSession(
    courseId: string,
    cohortId: string | undefined,
  ): Promise<void> {
    if (cohortId) {
      const cohort = await this.prisma.cohort.findFirst({
        where: { id: cohortId, courseId },
        select: { id: true },
      });
      if (!cohort) {
        throw new BadRequestException(
          "Pick one of this program's cohorts for the session.",
        );
      }
      return;
    }
    const hasCohorts = await this.prisma.cohort.count({
      where: { courseId, status: { not: CohortStatus.CANCELLED } },
    });
    if (hasCohorts > 0) {
      throw new BadRequestException('Pick the cohort this session is for.');
    }
  }

  /**
   * Get live sessions created by the logged-in user
   */
  async getMySessions(creatorId: string) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { creatorId },
      include: this.sessionListSelect,
      orderBy: { scheduledAt: 'desc' },
    });

    return {
      total: sessions.length,
      sessions: sessions.map((session) =>
        this.mapSessionWithAttendeeCount(session),
      ),
    };
  }

  /**
   * Get a single live session by ID, with full attendance list
   */
  async getLiveSessionById(id: string, user: SessionActor) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
        module: true,
        attendance: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Live session with ID "${id}" not found`);
    }
    this.assertOwnerOrAdmin(session, user.id, user.role);

    return session;
  }

  /** Change the meeting link of a scheduled session (creator or admin only). */
  async updateLiveSession(
    id: string,
    user: SessionActor,
    dto: UpdateLiveSessionDto,
  ) {
    const existingSession = await this.findSessionOrThrow(id);
    this.assertOwnerOrAdmin(existingSession, user.id, user.role);

    const session = await this.prisma.liveSession.update({
      where: { id },
      data: { meetingLink: dto.meetingLink, recordingUrl: dto.recordingUrl },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
      },
    });
    return { message: 'Live session updated successfully', session };
  }

  /**
   * A learner joins a session that is live: records their attendance and
   * returns the meeting link to open.
   */
  async joinSession(sessionId: string, user: SessionActor) {
    const session = await this.findSessionOrThrow(sessionId);
    await this.courseAccess.assertCohortMember(
      user,
      session.courseId,
      session.cohortId,
    );

    if (session.status !== LiveSessionStatus.LIVE) {
      throw new ConflictException(
        'This session has not started yet. You can join once the host goes live.',
      );
    }
    if (!session.meetingLink) {
      throw new ConflictException(
        'The host has not added a meeting link to this session yet.',
      );
    }

    const isHost =
      user.role === UserRole.ADMIN || session.creatorId === user.id;
    if (!isHost) {
      const existing = await this.prisma.sessionAttendance.findUnique({
        where: { sessionId_userId: { sessionId, userId: user.id } },
      });
      await this.prisma.sessionAttendance.upsert({
        where: { sessionId_userId: { sessionId, userId: user.id } },
        create: {
          sessionId,
          userId: user.id,
          status: AttendanceStatus.ATTENDED,
          joinedAt: new Date(),
        },
        update: {
          status: AttendanceStatus.ATTENDED,
          joinedAt: existing?.joinedAt ?? new Date(),
        },
      });
    }

    return { meetingLink: session.meetingLink };
  }

  /**
   * Fetch a session or throw 404, used internally by ownership-guarded actions
   */
  private async findSessionOrThrow(id: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Live session with ID "${id}" not found`);
    }
    return session;
  }

  private assertOwnerOrAdmin(
    session: { creatorId: string },
    userId: string,
    userRole: UserRole,
  ) {
    if (session.creatorId !== userId && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only the session creator or an admin can perform this action.',
      );
    }
  }

  /**
   * Update a live session's status (creator or admin only)
   */
  async updateStatus(
    id: string,
    userId: string,
    userRole: UserRole,
    dto: UpdateLiveSessionStatusDto,
  ) {
    const existingSession = await this.findSessionOrThrow(id);
    this.assertOwnerOrAdmin(existingSession, userId, userRole);

    const session = await this.prisma.liveSession.update({
      where: { id },
      data: { status: dto.status },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `🔄 Live session "${session.title}" status updated to ${session.status}`,
    );
    return {
      message: 'Live session status updated successfully',
      session,
    };
  }

  /**
   * Register the logged-in learner for a live session
   */
  async registerForSession(sessionId: string, user: SessionActor) {
    const session = await this.findSessionOrThrow(sessionId);
    await this.courseAccess.assertCohortMember(
      user,
      session.courseId,
      session.cohortId,
    );
    const userId = user.id;

    const attendance = await this.prisma.sessionAttendance.upsert({
      where: {
        sessionId_userId: { sessionId, userId },
      },
      create: {
        sessionId,
        userId,
        status: AttendanceStatus.REGISTERED,
      },
      update: {},
    });

    return {
      message: 'Registered for live session successfully',
      attendance,
    };
  }

  /**
   * Mark a learner's attendance for a session (creator or admin only)
   */
  async markAttendance(
    sessionId: string,
    userId: string,
    userRole: UserRole,
    dto: MarkAttendanceDto,
  ) {
    const session = await this.findSessionOrThrow(sessionId);
    this.assertOwnerOrAdmin(session, userId, userRole);

    const attendance = await this.prisma.sessionAttendance.upsert({
      where: {
        sessionId_userId: { sessionId, userId: dto.userId },
      },
      create: {
        sessionId,
        userId: dto.userId,
        status: dto.status,
        joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
        leftAt: dto.leftAt ? new Date(dto.leftAt) : undefined,
      },
      update: {
        status: dto.status,
        joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
        leftAt: dto.leftAt ? new Date(dto.leftAt) : undefined,
      },
    });

    return {
      message: 'Attendance marked successfully',
      attendance,
    };
  }

  /**
   * Get the full attendance list for a session (creator or admin only)
   */
  async getSessionAttendance(
    sessionId: string,
    userId: string,
    userRole: UserRole,
  ) {
    const session = await this.findSessionOrThrow(sessionId);
    this.assertOwnerOrAdmin(session, userId, userRole);

    const attendance = await this.prisma.sessionAttendance.findMany({
      where: { sessionId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      total: attendance.length,
      attendance,
    };
  }
}
