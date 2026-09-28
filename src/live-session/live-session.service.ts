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
  EnrollmentStatus,
  LiveSessionStatus,
  UserRole,
} from '../generated/prisma/client';
import { CourseAccessService } from '../course-access/course-access.service';
import { LiveKitService, type LiveKitJoinGrant } from './livekit.service';
import { LiveSessionNotifier } from './live-session-notifier.service';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';

/** Learners can enter from the moment the waiting room opens. */
const JOINABLE_STATUSES: LiveSessionStatus[] = [
  LiveSessionStatus.WAITING,
  LiveSessionStatus.LIVE,
];

/** The statuses each transition may start from; anything else is a 409. */
const ALLOWED_PREVIOUS_STATUSES: Partial<
  Record<LiveSessionStatus, LiveSessionStatus[]>
> = {
  [LiveSessionStatus.WAITING]: [LiveSessionStatus.SCHEDULED],
  [LiveSessionStatus.LIVE]: [
    LiveSessionStatus.SCHEDULED,
    LiveSessionStatus.WAITING,
    LiveSessionStatus.LIVE,
  ],
  [LiveSessionStatus.CANCELLED]: [
    LiveSessionStatus.SCHEDULED,
    LiveSessionStatus.WAITING,
  ],
};

type SessionActor = { id: string; role: UserRole };

/** Wide enough for a month grid padded to whole weeks, small enough to keep the query bounded. */
const MAX_SCHEDULE_WINDOW_DAYS = 45;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SCHEDULE_ENROLLMENT_STATUSES = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.COMPLETED,
];

@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courseAccess: CourseAccessService,
    private readonly liveKit: LiveKitService,
    private readonly notifier: LiveSessionNotifier,
  ) {}

  /** Recordings are for the program's learners only, not the public session list. */
  private readonly publicSessionOmit = { recordingUrl: true } as const;

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
    const { courseId, moduleId, ...sessionData } = dto;
    const creatorId = creator.id;

    // Sessions are how a cohort is taught, so they're allowed in any program status;
    // only the curriculum is frozen by review and approval.
    await this.courseAccess.assertCourseOwner(creator, courseId);
    // Fail at scheduling time, not when the host tries to go live.
    this.liveKit.assertConfigured();

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

    const session = await this.prisma.liveSession.create({
      data: {
        ...sessionData,
        scheduledAt: new Date(sessionData.scheduledAt),
        courseId,
        moduleId: moduleId || undefined,
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

    await this.notifier.notifyScheduled(session);
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

  /** A program's sessions with their recordings, for its learners (including rewatch buyers) and owner. */
  async getProgramSessions(courseId: string, user: SessionActor) {
    await this.courseAccess.assertCourseMember(user, courseId);
    const sessions = await this.prisma.liveSession.findMany({
      where: { courseId },
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
   * The learner's calendar: every non-cancelled session in the programs they're
   * enrolled in, within [from, to). Past sessions are included so a day's
   * agenda still shows what already happened.
   */
  async getLearnerSchedule(userId: string, from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    const windowMs = end.getTime() - start.getTime();
    if (windowMs <= 0) {
      throw new BadRequestException('to must be after from');
    }
    if (windowMs > MAX_SCHEDULE_WINDOW_DAYS * MS_PER_DAY) {
      throw new BadRequestException(
        `The schedule window can be at most ${MAX_SCHEDULE_WINDOW_DAYS} days`,
      );
    }

    const sessions = await this.prisma.liveSession.findMany({
      where: {
        scheduledAt: { gte: start, lt: end },
        status: { not: LiveSessionStatus.CANCELLED },
        course: {
          enrollments: {
            some: { userId, status: { in: SCHEDULE_ENROLLMENT_STATUSES } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        course: { select: { id: true, name: true } },
        creator: { select: { name: true } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      scheduledAt: session.scheduledAt,
      durationMins: session.durationMins,
      status: session.status,
      courseId: session.course.id,
      courseName: session.course.name,
      creatorName: session.creator.name,
    }));
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

  /**
   * Reschedule a session that hasn't started (title, type, time, duration) or
   * set its recording link. Moving the start time re-arms the 30-minute
   * reminder and tells learners the new time.
   */
  async updateLiveSession(
    id: string,
    user: SessionActor,
    dto: UpdateLiveSessionDto,
  ) {
    const existingSession = await this.findSessionOrThrow(id);
    this.assertOwnerOrAdmin(existingSession, user.id, user.role);

    const { recordingUrl, scheduledAt, ...scheduleFields } = dto;
    const changesSchedule =
      scheduledAt !== undefined ||
      Object.values(scheduleFields).some((value) => value !== undefined);
    if (
      changesSchedule &&
      existingSession.status !== LiveSessionStatus.SCHEDULED
    ) {
      throw new ConflictException(
        'Only sessions that have not started can be rescheduled.',
      );
    }

    const nextStart = scheduledAt ? new Date(scheduledAt) : undefined;
    if (nextStart && nextStart.getTime() <= Date.now()) {
      throw new BadRequestException('Pick a start time in the future.');
    }
    const isMoved =
      nextStart !== undefined &&
      nextStart.getTime() !== existingSession.scheduledAt.getTime();

    const session = await this.prisma.liveSession.update({
      where: { id },
      data: {
        ...scheduleFields,
        recordingUrl,
        scheduledAt: nextStart,
        ...(isMoved && { reminderSentAt: null }),
      },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
      },
    });

    if (isMoved) {
      await this.notifier.notifyRescheduled(
        session,
        existingSession.scheduledAt,
      );
    }
    return { message: 'Live session updated successfully', session };
  }

  /**
   * Removes a session scheduled by mistake. Once learners have registered or
   * it has run, it must be cancelled instead so the record and their notice survive.
   */
  async deleteLiveSession(id: string, user: SessionActor) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
      include: {
        course: { select: { name: true } },
        _count: { select: { attendance: true } },
      },
    });
    if (!session) {
      throw new NotFoundException(`Live session with ID "${id}" not found`);
    }
    this.assertOwnerOrAdmin(session, user.id, user.role);
    if (
      session.status !== LiveSessionStatus.SCHEDULED ||
      session._count.attendance > 0
    ) {
      throw new ConflictException(
        'This session has registrations or has already run. Cancel it instead.',
      );
    }

    await this.prisma.liveSession.delete({ where: { id } });
    // Learners were emailed when it was scheduled, so they're told it's off.
    await this.notifier.notifyCancelled(session);
    return { message: 'Live session deleted' };
  }

  /**
   * Joins a live session's LiveKit room: returns a room token for the caller
   * and, for learners, records their attendance. The host joins the same way.
   */
  async joinSession(
    sessionId: string,
    user: SessionActor,
  ): Promise<
    LiveKitJoinGrant & {
      sessionTitle: string;
      courseId: string;
      isHost: boolean;
      status: LiveSessionStatus;
      openedAt: Date | null;
      startedAt: Date | null;
      enrolledCount: number;
    }
  > {
    const session = await this.findSessionOrThrow(sessionId);
    await this.courseAccess.assertCourseMember(user, session.courseId);

    if (!JOINABLE_STATUSES.includes(session.status)) {
      throw new ConflictException(
        'This session is not open yet. You can join once the host opens the waiting room.',
      );
    }

    const isHost =
      user.role === UserRole.ADMIN || session.creatorId === user.id;
    const { name } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true },
    });
    const grant = await this.liveKit.createJoinToken({
      sessionId,
      durationMins: session.durationMins,
      userId: user.id,
      userName: name,
      isHost,
    });

    if (!isHost) {
      // Recorded here too, not only from the webhook, so attendance still works
      // where LiveKit can't reach the API (local development).
      await this.recordLearnerJoined(sessionId, user.id);
    }
    return {
      ...grant,
      sessionTitle: session.title,
      courseId: session.courseId,
      isHost,
      status: session.status,
      openedAt: session.openedAt,
      startedAt: session.startedAt,
      enrolledCount: await this.countEnrolled(session.courseId),
    };
  }

  /**
   * Applies LiveKit's signed participant events to attendance, so join and
   * leave times reflect who was actually in the room.
   */
  async handleLiveKitWebhook(
    rawBody: string,
    authorization: string | undefined,
  ): Promise<void> {
    const event = await this.liveKit.receiveWebhook(rawBody, authorization);
    const sessionId = event.room
      ? this.liveKit.sessionIdFromRoom(event.room.name)
      : null;
    const userId = event.participant?.identity;
    if (!sessionId || !userId) return;

    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true },
    });
    // The host's own presence isn't attendance.
    if (!session || session.creatorId === userId) return;

    if (event.event === 'participant_joined') {
      await this.recordLearnerJoined(sessionId, userId);
    } else if (event.event === 'participant_left') {
      await this.prisma.sessionAttendance.updateMany({
        where: { sessionId, userId },
        data: { leftAt: new Date() },
      });
    }
  }

  private countEnrolled(courseId: string): Promise<number> {
    return this.prisma.enrollment.count({
      where: { courseId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
    });
  }

  private async recordLearnerJoined(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.sessionAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    await this.prisma.sessionAttendance.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      create: {
        sessionId,
        userId,
        status: AttendanceStatus.ATTENDED,
        joinedAt: new Date(),
      },
      update: {
        status: AttendanceStatus.ATTENDED,
        // Keep the first join time across reconnects; a rejoin clears the last leave.
        joinedAt: existing?.joinedAt ?? new Date(),
        leftAt: null,
      },
    });
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
    const allowedFrom = ALLOWED_PREVIOUS_STATUSES[dto.status];
    if (allowedFrom && !allowedFrom.includes(existingSession.status)) {
      throw new ConflictException(
        dto.status === LiveSessionStatus.CANCELLED
          ? 'Only sessions that have not started can be cancelled. End a live session instead.'
          : `A ${existingSession.status.toLowerCase()} session cannot move to ${dto.status.toLowerCase()}.`,
      );
    }

    const now = new Date();
    const session = await this.prisma.liveSession.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === LiveSessionStatus.WAITING && { openedAt: now }),
        ...(dto.status === LiveSessionStatus.LIVE &&
          !existingSession.startedAt && { startedAt: now }),
        ...(dto.status === LiveSessionStatus.ENDED && { endedAt: now }),
      },
      include: {
        creator: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
      },
    });

    if (dto.status === LiveSessionStatus.WAITING) {
      await this.liveKit.openRoom(id, { status: 'WAITING', startedAt: null });
    }
    if (
      dto.status === LiveSessionStatus.LIVE &&
      existingSession.status !== LiveSessionStatus.LIVE
    ) {
      await this.liveKit.updateRoomState(id, {
        status: 'LIVE',
        startedAt: (session.startedAt ?? now).toISOString(),
      });
      await this.notifier.notifyStarted(session);
    }
    if (
      dto.status === LiveSessionStatus.CANCELLED &&
      existingSession.status !== LiveSessionStatus.CANCELLED
    ) {
      await this.notifier.notifyCancelled(session);
    }
    if (
      dto.status === LiveSessionStatus.ENDED ||
      (dto.status === LiveSessionStatus.CANCELLED &&
        existingSession.status === LiveSessionStatus.WAITING)
    ) {
      await this.liveKit.closeRoom(id);
      // Anyone still in the room left when it closed.
      await this.prisma.sessionAttendance.updateMany({
        where: { sessionId: id, joinedAt: { not: null }, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

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
    await this.courseAccess.assertCourseMember(user, session.courseId);
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
      enrolledCount: await this.countEnrolled(session.courseId),
      openedAt: session.openedAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }
}
