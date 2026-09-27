import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { Notification } from '../generated/prisma/client';
import { escapeHtml } from '../utils/escape-html';
import { pageMeta, toPrismaPage } from '../utils/pagination';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationEventsService } from './notification-events.service';

export interface CourseReviewEmailOptions {
  email: string;
  name: string;
  courseName: string;
  approved: boolean;
  reason?: string | null;
  attachmentUrls?: string[];
}

/** Columns of NotificationPreference that switch an email off. */
type EmailPreferenceKey = 'emailAssignmentGraded' | 'emailLiveSessions';

/** Learners are in Nigeria; the email states the time explicitly rather than guessing theirs. */
const LIVE_SESSION_EMAIL_TIME_ZONE = 'Africa/Lagos';

interface AssignmentGradedEmailOptions {
  userId: string;
  assignmentTitle: string;
  courseId: string;
  courseName: string;
  score: number;
  maxScore: number;
}

interface LiveSessionEmailOptions {
  userIds: string[];
  sessionTitle: string;
  courseId: string;
  courseName: string;
  scheduledAt: Date;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend;
  private readonly defaultFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEvents: NotificationEventsService,
  ) {
    const apiKey = process.env.RESEND_API_KEY || '';
    if (!apiKey || apiKey === 'your_resend_api_key_here') {
      this.logger.warn('⚠️ RESEND_API_KEY is not configured in .env!');
    }
    this.resend = new Resend(apiKey);
    this.defaultFrom = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  }

  /**
   * Wraps a template's inner content in JOS Academy's shared email chrome
   * (brand header, card surface, footer) so every transactional email looks
   * like one system instead of five ad-hoc templates. System font stack
   * only — most email clients strip @font-face/Google Fonts anyway.
   */
  private renderEmailLayout(preheader: string, bodyHtml: string): string {
    return `
      <div style="background: linear-gradient(180deg, #f4f4f5 0%, #ececef 100%); padding: 48px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <span style="display: none; max-height: 0; overflow: hidden;">${preheader}</span>
        <div style="max-width: 480px; margin: 0 auto;">
          <div style="text-align: center; padding-bottom: 28px;">
            <span style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #ffffff; width: 40px; height: 40px; line-height: 40px; border-radius: 12px; font-size: 18px; font-weight: 800; margin-bottom: 10px;">J</span>
            <div style="font-size: 17px; font-weight: 800; color: #18181b; letter-spacing: -0.01em;">JOS Academy</div>
          </div>
          <div style="background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 8px 24px rgba(24,24,27,0.08), 0 1px 2px rgba(24,24,27,0.04);">
            <div style="height: 6px; background: linear-gradient(90deg, #7c3aed, #a855f7, #38bdf8);"></div>
            <div style="padding: 40px 32px;">
              ${bodyHtml}
            </div>
          </div>
          <p style="text-align: center; color: #a1a1aa; font-size: 12px; margin-top: 24px; line-height: 1.6;">
            © ${new Date().getFullYear()} JOS Academy. If you didn't expect this email, you can safely ignore it.
          </p>
        </div>
      </div>
    `;
  }

  private emailButton(href: string, label: string): string {
    return `
      <div style="margin: 28px 0;">
        <a href="${href}" style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(124,58,237,0.35);">
          ${label}
        </a>
      </div>
    `;
  }

  /**
   * Generic method to send an email using Resend
   */
  async sendEmail(options: SendEmailOptions) {
    try {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const fromName = process.env.RESEND_FROM_NAME;
      const fromAddress =
        options.from || (fromName ? `${fromName} <${fromEmail}>` : fromEmail);

      const data = await this.resend.emails.send({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(
        `📧 Email sent successfully to ${options.to}. ID: ${data.data?.id}`,
      );
      return data;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to send email to ${options.to}:`,
        error.message,
      );
      throw error;
    }
  }

  /** Send email verification link */
  async sendEmailVerirfaction(
    email: string,
    name: string,
    verificationLink: string,
  ) {
    try {
      await this.sendEmail({
        to: email,
        subject: 'Verify your email — JOS Academy',
        html: this.renderEmailLayout(
          'Verify your email to activate your JOS Academy account.',
          `
            <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">Welcome, ${name} 👋</h1>
            <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
              Thanks for creating an account with JOS Academy. Confirm it's you to activate your account:
            </p>
            ${this.emailButton(verificationLink, 'Verify email address')}
            <p style="color: #a1a1aa; font-size: 13px; line-height: 1.6; margin: 0;">
              Or paste this link into your browser:<br />
              <span style="word-break: break-all; color: #7c3aed;">${verificationLink}</span>
            </p>
            <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
            <p style="color: #a1a1aa; font-size: 13px; margin: 0;">This link expires in 24 hours.</p>
          `,
        ),
      });
    } catch (emailError: any) {
      this.logger.error(
        `Failed to send verification email to ${email}:`,
        emailError?.message,
      );
    }
  }

  /**
   * Send Password Reset Link Email
   */
  async sendPasswordResetLinkEmail(
    email: string,
    name: string,
    resetLink: string,
  ) {
    try {
      await this.sendEmail({
        to: email,
        subject: 'Reset your password — JOS Academy',
        html: this.renderEmailLayout(
          'Reset your JOS Academy password.',
          `
            <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">Password reset request 🔐</h1>
            <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
              Hi ${name}, we received a request to reset your password. Click below to set a new one:
            </p>
            ${this.emailButton(resetLink, 'Reset password')}
            <p style="color: #a1a1aa; font-size: 13px; line-height: 1.6; margin: 0;">
              Or paste this link into your browser:<br />
              <span style="word-break: break-all; color: #7c3aed;">${resetLink}</span>
            </p>
            <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
            <p style="color: #a1a1aa; font-size: 13px; margin: 0;">
              This link expires in 1 hour. If you didn't request this, you can ignore this email.
            </p>
          `,
        ),
      });
    } catch (emailError: any) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        emailError?.message,
      );
    }
  }

  /**
   * Send Onboarding Credentials Email to a newly created Creator / Instructor
   */
  async sendCreatorCredentialsEmail(
    email: string,
    name: string,
    tempPassword: string,
    wasApplicant = false,
  ) {
    const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/sign-in`;
    const subject = wasApplicant
      ? 'Congratulations! Your JOS Academy creator application was accepted 🎉'
      : 'Your JOS Academy creator account — login credentials';
    const introParagraph = wasApplicant
      ? `Congratulations, your <strong>Creator / Instructor</strong> application has been accepted! Your account is ready — here are your login credentials:`
      : `An admin created your <strong>Creator / Instructor</strong> account. Here are your login credentials:`;

    try {
      await this.sendEmail({
        to: email,
        subject,
        html: this.renderEmailLayout(
          wasApplicant
            ? `Your JOS Academy creator application was accepted, ${name}!`
            : `Your JOS Academy creator account is ready, ${name}.`,
          `
            ${
              wasApplicant
                ? `<span style="display: inline-block; background-color: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 9999px; margin-bottom: 14px;">APPLICATION ACCEPTED</span>`
                : ''
            }
            <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">${
              wasApplicant
                ? `Congratulations, ${name}! 🎉`
                : `Welcome, ${name} 🎉`
            }</h1>
            <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
              ${introParagraph}
            </p>
            <div style="background-color: #faf9fb; border: 1px solid #f0edf3; border-radius: 14px; padding: 18px 20px; margin: 22px 0;">
              <p style="margin: 0 0 10px; color: #71717a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;">Your login credentials</p>
              <p style="margin: 4px 0; color: #18181b; font-size: 14px;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0; color: #18181b; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                <strong>Temporary password:</strong>
                <code style="background-color: #ffffff; border: 1px solid #e4e4e7; padding: 3px 10px; border-radius: 6px; font-size: 14px; color: #7c3aed; font-weight: 700;">${tempPassword}</code>
              </p>
            </div>
            ${this.emailButton(loginUrl, 'Log in to your account')}
            <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
            <p style="color: #a1a1aa; font-size: 13px; margin: 0;">
              We strongly recommend changing your password after your first login.
            </p>
          `,
        ),
      });
    } catch (emailError: any) {
      this.logger.error(
        `Failed to send creator credentials email to ${email}:`,
        emailError?.message,
      );
    }
  }

  /**
   * Create a persisted in-app notification row for a user
   */
  async createNotification(
    userId: string,
    title: string,
    body: string,
    type: string,
    link?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, title, body, type, link },
    });
    this.notificationEvents.publish(notification);

    this.logger.log(`🔔 Notification created for user ${userId}: ${title}`);
    return notification;
  }

  /** Same notification for several users (e.g. every admin), each pushed live. */
  async createNotifications(
    userIds: string[],
    title: string,
    body: string,
    type: string,
    link?: string,
  ): Promise<Notification[]> {
    const notifications = await this.prisma.notification.createManyAndReturn({
      data: userIds.map((userId) => ({ userId, title, body, type, link })),
    });
    notifications.forEach((notification) =>
      this.notificationEvents.publish(notification),
    );

    this.logger.log(
      `🔔 Notification created for ${notifications.length} users: ${title}`,
    );
    return notifications;
  }

  /** Users who haven't switched this email off (no preferences row means everything is on). */
  private async emailRecipients(
    userIds: string[],
    preference: EmailPreferenceKey,
  ): Promise<{ id: string; email: string; name: string }[]> {
    if (userIds.length === 0) return [];
    return this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isSuspended: false,
        OR: [
          { notificationPreference: null },
          { notificationPreference: { [preference]: true } },
        ],
      },
      select: { id: true, email: true, name: true },
    });
  }

  /** Email failures are logged, never thrown: the grade or session they announce already saved. */
  private async sendEmailQuietly(options: SendEmailOptions): Promise<void> {
    try {
      await this.sendEmail(options);
    } catch (emailError: any) {
      this.logger.error(
        `Failed to send "${options.subject}" to ${options.to}:`,
        emailError?.message,
      );
    }
  }

  async sendAssignmentGradedEmail({
    userId,
    assignmentTitle,
    courseId,
    courseName,
    score,
    maxScore,
  }: AssignmentGradedEmailOptions): Promise<void> {
    const [recipient] = await this.emailRecipients(
      [userId],
      'emailAssignmentGraded',
    );
    if (!recipient) return;

    const programUrl = `${process.env.APP_URL || 'http://localhost:3000'}/programs/${courseId}`;
    await this.sendEmailQuietly({
      to: recipient.email,
      subject: `Your assignment "${assignmentTitle}" was graded`,
      html: this.renderEmailLayout(
        `You scored ${score}/${maxScore} on ${assignmentTitle}.`,
        `
          <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">Assignment graded</h1>
          <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
            Hi ${escapeHtml(recipient.name)}, your instructor graded <strong>${escapeHtml(assignmentTitle)}</strong>
            in ${escapeHtml(courseName)}. You scored <strong>${score}/${maxScore}</strong>.
          </p>
          ${this.emailButton(programUrl, 'See feedback')}
        `,
      ),
    });
  }

  async sendLiveSessionScheduledEmails({
    userIds,
    sessionTitle,
    courseId,
    courseName,
    scheduledAt,
  }: LiveSessionEmailOptions): Promise<void> {
    const recipients = await this.emailRecipients(userIds, 'emailLiveSessions');
    const programUrl = `${process.env.APP_URL || 'http://localhost:3000'}/programs/${courseId}`;
    const when = scheduledAt.toLocaleString('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: LIVE_SESSION_EMAIL_TIME_ZONE,
    });

    await Promise.all(
      recipients.map((recipient) =>
        this.sendEmailQuietly({
          to: recipient.email,
          subject: `New live session: ${sessionTitle}`,
          html: this.renderEmailLayout(
            `${sessionTitle} is scheduled for ${when}.`,
            `
              <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">A live session was scheduled</h1>
              <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
                Hi ${escapeHtml(recipient.name)}, <strong>${escapeHtml(sessionTitle)}</strong> for
                ${escapeHtml(courseName)} is on <strong>${when}</strong> (Lagos time).
              </p>
              ${this.emailButton(programUrl, 'Open program')}
            `,
          ),
        }),
      ),
    );
  }

  /** Tells a creator the outcome of an admin's review of their program. */
  async sendCourseReviewEmail({
    email,
    name,
    courseName,
    approved,
    reason,
    attachmentUrls,
  }: CourseReviewEmailOptions): Promise<void> {
    const dashboardUrl = `${process.env.APP_URL || 'http://localhost:3000'}/creator-dashboard?tab=programs`;
    const screenshots = (attachmentUrls ?? [])
      .map(
        (url, index) =>
          `<li><a href="${escapeHtml(url)}" style="color: #4f46e5;">Screenshot ${index + 1}</a></li>`,
      )
      .join('');

    await this.sendEmailQuietly({
      to: email,
      subject: approved
        ? `${courseName} is approved and live`
        : `${courseName} needs changes`,
      html: this.renderEmailLayout(
        approved
          ? `${courseName} passed review and is now open for enrollment.`
          : `${courseName} needs a few changes before it can go live.`,
        `
          <h1 style="color: #18181b; font-size: 20px; font-weight: 800; margin: 0 0 12px;">
            ${approved ? 'Your program is live' : 'Your program needs changes'}
          </h1>
          <p style="color: #52525b; font-size: 15px; line-height: 1.6; margin: 0;">
            Hi ${escapeHtml(name)}, ${
              approved
                ? `<strong>${escapeHtml(courseName)}</strong> passed review and is now open for enrollment.`
                : `an admin reviewed <strong>${escapeHtml(courseName)}</strong> and asked for changes before it can go live.`
            }
          </p>
          ${
            !approved && reason
              ? `<p style="color: #18181b; font-size: 15px; line-height: 1.6; margin: 16px 0 0; padding: 12px 16px; background: #fef2f2; border-radius: 12px;">${escapeHtml(reason)}</p>`
              : ''
          }
          ${!approved && screenshots ? `<ul style="margin: 12px 0 0; padding-left: 20px;">${screenshots}</ul>` : ''}
          ${this.emailButton(dashboardUrl, 'Open your programs')}
        `,
      ),
    });
  }

  /**
   * One page of a user's notifications, newest first, optionally unread only.
   * `unreadCount` is across all pages so a badge never reflects just one page.
   */
  async listForUser(userId: string, query: ListNotificationsQueryDto) {
    const where = query.unreadOnly ? { userId, isRead: false } : { userId };
    const [total, unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toPrismaPage(query),
      }),
    ]);

    return { ...pageMeta(total, query), unreadCount, notifications };
  }

  /**
   * Mark a single notification as read (must belong to the requesting user)
   */
  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    this.logger.log(`🔔 Notification ${id} marked as read for user ${userId}`);
    return updated;
  }

  /**
   * Mark all of a user's unread notifications as read
   */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    this.logger.log(
      `🔔 Marked ${result.count} notifications as read for user ${userId}`,
    );
    return { count: result.count };
  }
}
