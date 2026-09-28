import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NOTIFICATION_LINKS } from '../notification/notification-links';
import { ENROLLMENT_ACCESS_STATUSES } from '../enrollment/enrollment-access';
import {
  AttendanceStatus,
  LiveSessionStatus,
} from '../generated/prisma/client';

const LIVE_SESSION_NOTIFICATION_TYPE = 'live-session';
const REMINDER_LEAD_MINUTES = 30;
const MS_PER_MINUTE = 60_000;

type NotifiableSession = {
  id: string;
  title: string;
  courseId: string;
  scheduledAt: Date;
  course: { name: string };
};

/**
 * Tells a program's learners about a session: when it's scheduled (email),
 * 30 minutes before, when the host goes live (only those not already in the
 * room), and if it's moved or cancelled (all in-app + email).
 */
@Injectable()
export class LiveSessionNotifier {
  private readonly logger = new Logger(LiveSessionNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async notifyScheduled(session: NotifiableSession): Promise<void> {
    const learnerIds = await this.enrolledLearnerIds(session.courseId);
    await this.notifications.sendLiveSessionEmails(
      'scheduled',
      this.emailOptions(session, learnerIds),
    );
  }

  async notifyStarted(session: NotifiableSession): Promise<void> {
    const [learnerIds, alreadyJoined] = await Promise.all([
      this.enrolledLearnerIds(session.courseId),
      this.prisma.sessionAttendance.findMany({
        where: { sessionId: session.id, status: AttendanceStatus.ATTENDED },
        select: { userId: true },
      }),
    ]);
    const joinedIds = new Set(alreadyJoined.map((entry) => entry.userId));
    const recipientIds = learnerIds.filter((id) => !joinedIds.has(id));
    if (recipientIds.length === 0) return;

    await this.notifications.createNotifications(
      recipientIds,
      `Live now: ${session.title}`,
      `${session.course.name} — the host has started the session. Join now.`,
      LIVE_SESSION_NOTIFICATION_TYPE,
      NOTIFICATION_LINKS.liveRoom(session.id),
    );
    await this.notifications.sendLiveSessionEmails(
      'started',
      this.emailOptions(session, recipientIds),
    );
  }

  async notifyRescheduled(
    session: NotifiableSession,
    previousScheduledAt: Date,
  ): Promise<void> {
    const learnerIds = await this.enrolledLearnerIds(session.courseId);
    if (learnerIds.length === 0) return;
    await this.notifications.createNotifications(
      learnerIds,
      `Rescheduled: ${session.title}`,
      `${session.course.name} — this session has a new time. Check the program for details.`,
      LIVE_SESSION_NOTIFICATION_TYPE,
      NOTIFICATION_LINKS.program(session.courseId),
    );
    await this.notifications.sendLiveSessionEmails('rescheduled', {
      ...this.emailOptions(session, learnerIds),
      previousScheduledAt,
    });
  }

  async notifyCancelled(session: NotifiableSession): Promise<void> {
    const learnerIds = await this.enrolledLearnerIds(session.courseId);
    if (learnerIds.length === 0) return;
    await this.notifications.createNotifications(
      learnerIds,
      `Cancelled: ${session.title}`,
      `${session.course.name} — the host cancelled this session.`,
      LIVE_SESSION_NOTIFICATION_TYPE,
      NOTIFICATION_LINKS.program(session.courseId),
    );
    await this.notifications.sendLiveSessionEmails(
      'cancelled',
      this.emailOptions(session, learnerIds),
    );
  }

  /** Runs every minute; each session's reminder is claimed atomically, so several API instances never double-send. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    const dueSessions = await this.prisma.liveSession.findMany({
      where: {
        status: LiveSessionStatus.SCHEDULED,
        reminderSentAt: null,
        scheduledAt: {
          gt: now,
          lte: new Date(now.getTime() + REMINDER_LEAD_MINUTES * MS_PER_MINUTE),
        },
      },
      include: { course: { select: { name: true } } },
    });

    for (const session of dueSessions) {
      const claim = await this.prisma.liveSession.updateMany({
        where: { id: session.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claim.count === 0) continue;

      try {
        await this.sendReminder(session, now);
      } catch (error) {
        // One failing session must not stop the others' reminders.
        this.logger.error(
          `Reminder for live session ${session.id} failed: ${String(error)}`,
        );
      }
    }
  }

  private async sendReminder(
    session: NotifiableSession,
    now: Date,
  ): Promise<void> {
    const learnerIds = await this.enrolledLearnerIds(session.courseId);
    if (learnerIds.length === 0) return;

    // Sessions scheduled less than 30 minutes ahead get the real countdown.
    const minutesUntilStart = Math.max(
      1,
      Math.round(
        (session.scheduledAt.getTime() - now.getTime()) / MS_PER_MINUTE,
      ),
    );
    await this.notifications.createNotifications(
      learnerIds,
      `Starting in ${minutesUntilStart} min: ${session.title}`,
      `${session.course.name} — join from your dashboard once the host goes live.`,
      LIVE_SESSION_NOTIFICATION_TYPE,
      NOTIFICATION_LINKS.learnerDashboard(),
    );
    await this.notifications.sendLiveSessionEmails(
      'reminder',
      this.emailOptions(session, learnerIds),
    );
  }

  private async enrolledLearnerIds(courseId: string): Promise<string[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
      select: { userId: true },
    });
    return enrollments.map((enrollment) => enrollment.userId);
  }

  private emailOptions(session: NotifiableSession, userIds: string[]) {
    return {
      userIds,
      sessionId: session.id,
      sessionTitle: session.title,
      courseId: session.courseId,
      courseName: session.course.name,
      scheduledAt: session.scheduledAt,
    };
  }
}
