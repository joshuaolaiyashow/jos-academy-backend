import 'multer';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { UserRole } from '../generated/prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

const DELETED_USER_NAME = 'Deleted user';
const DELETED_EMAIL_DOMAIN = 'deleted.josacademy.invalid';
const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUploadService: FileUploadService,
    private readonly audit: AuditService,
  ) {}

  /** Every email is on until the user switches it off, so a missing row reads as all-true. */
  async getNotificationPreferences(userId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { emailAssignmentGraded: true, emailLiveSessions: true },
    });
    return (
      preference ?? { emailAssignmentGraded: true, emailLiveSessions: true }
    );
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
      select: { emailAssignmentGraded: true, emailLiveSessions: true },
    });
  }

  /**
   * Students only. The row is anonymised rather than removed: payments, credit history
   * and enrollments cascade from User and must survive for finance and creator reports.
   * Suspending it and revoking refresh tokens signs the user out everywhere for good.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.USER) {
      throw new ForbiddenException(
        'Creator and admin accounts can only be closed by an administrator.',
      );
    }
    if (dto.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException(
        'The email you typed does not match this account.',
      );
    }

    const unusablePassword = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      PASSWORD_HASH_ROUNDS,
    );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: DELETED_USER_NAME,
          email: `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`,
          password: unusablePassword,
          avatarUrl: null,
          phone: null,
          country: null,
          bio: null,
          referralCode: null,
          isSuspended: true,
        },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.notificationPreference.deleteMany({ where: { userId } }),
    ]);

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_ACCOUNT_DELETED,
      actor: { id: userId, role: user.role },
      targetType: AUDIT_TARGETS.USER,
      targetId: userId,
    });
    this.logger.log(`🗑️ Account deleted (anonymised) for user ${userId}`);

    return { message: 'Your account has been deleted.' };
  }

  /**
   * Get the current user's full profile, excluding the password hash,
   * plus derived counts for enrolled courses and unread notifications
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [enrolledCoursesCount, unreadNotificationsCount] = await Promise.all([
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const { password, ...safeUser } = user;

    return {
      ...safeUser,
      enrolledCoursesCount,
      unreadNotificationsCount,
    };
  }

  /**
   * Update editable fields on the current user's profile
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    this.logger.log(`👤 Profile updated for user ${userId}`);

    const { password, ...safeUser } = updatedUser;

    return {
      message: 'Profile updated successfully',
      user: safeUser,
    };
  }

  /**
   * Upload and set the current user's avatar image
   */
  async updateAvatar(userId: string, file: Express.Multer.File) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const uploadResult = await this.fileUploadService.uploadFile(
      file,
      'avatars',
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: uploadResult.url },
    });

    this.logger.log(`🖼️ Avatar updated for user ${userId}`);

    return {
      message: 'Avatar updated successfully',
      avatarUrl: uploadResult.url,
    };
  }
}
