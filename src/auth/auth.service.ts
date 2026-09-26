import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { generateReferralCode } from '../utils';
import { UserRole, VerificationType } from '../generated/prisma/client';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  AUTH_ERROR_CODES,
  REFRESH_REUSE_GRACE_MS,
  refreshTokenTtlMs,
  type ClientType,
} from './auth.constants';
import { AuditService } from '../audit/audit.service';
import { ReferralService } from '../referral/referral.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

const ACCESS_TOKEN_TTL = '15m';
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;
const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';
const ACCOUNT_SUSPENDED_CODE = AUTH_ERROR_CODES.ACCOUNT_SUSPENDED;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly notificationService: NotificationService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues a fresh access/refresh token pair for a user and persists a hash
   * of the refresh token (never the raw token) so it can be looked up,
   * rotated, and revoked without ever storing a usable secret at rest.
   */
  private async issueTokenPair(
    user: {
      id: string;
      email: string;
      role: UserRole;
    },
    clientType: ClientType,
  ) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    // The unique jti stops two refresh tokens issued for the same user within
    // the same second from being identical and colliding on the tokenHash index.
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: randomUUID(), ct: clientType },
      {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        expiresIn: Math.floor(refreshTokenTtlMs(clientType) / 1000),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs(clientType)),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Register a new user and send an email verification link
   */
  async signUp(body: RegisterDto) {
    const { email, name, password, role, referralCode } = body;

    // 1. Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException(
        'User with this email address already exists',
      );
    }

    // Checked before anything is written so a mistyped code doesn't leave a half-made account.
    const referredById = await this.referrals.findReferrerId(referralCode);

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Generate unique referral code for new user if not provided
    const userReferralCode = generateReferralCode(8, 'JOS');

    // 4. Create User record with isEmailVerified = false
    const user = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        referralCode: userReferralCode,
        referredById,
        role: role || UserRole.USER,
        isEmailVerified: false,
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_SIGN_UP,
      actor: { id: user.id, role: user.role },
      targetType: AUDIT_TARGETS.USER,
      targetId: user.id,
      metadata: { role: user.role },
    });

    // 5. Issue a verification token and email the link
    await this.sendVerificationEmail(user);

    // 6. A self-registered instructor is effectively a creator application —
    // let every admin know so it shows up in their notifications feed.
    if (user.role === UserRole.INSTRUCTOR) {
      await this.notifyAdminsOfNewInstructor(user);
    }

    return {
      message:
        'Registration successful! Please check your email to verify your account.',
      userId: user.id,
      email: user.email,
    };
  }

  /**
   * Replaces any outstanding verification token for the user with a fresh one
   * and emails the link. APP_URL is the frontend's origin — the link lands on
   * its /verify-email page, which calls back into POST /auth/verify-email.
   */
  private async sendVerificationEmail(user: {
    id: string;
    email: string;
    name: string;
  }) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.verification.deleteMany({
      where: { userId: user.id, type: VerificationType.EMAIL_VERIFICATION },
    });
    await this.prisma.verification.create({
      data: {
        userId: user.id,
        type: VerificationType.EMAIL_VERIFICATION,
        token,
        expiresAt,
      },
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationLink = `${appUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
    await this.notificationService.sendEmailVerirfaction(
      user.email,
      user.name,
      verificationLink,
    );
  }

  /**
   * Creates a real in-app notification for every admin when a new
   * instructor account registers, so the admin dashboard's notification
   * feed reflects actual creator sign-ups instead of a fixture.
   */
  private async notifyAdminsOfNewInstructor(instructor: {
    name: string;
    email: string;
  }) {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationService.createNotification(
          admin.id,
          instructor.name,
          `Registered as an instructor (${instructor.email}) — review their creator application.`,
          'creator-application',
          NOTIFICATION_LINKS.adminApplications(),
        ),
      ),
    );
  }

  /**
   * Re-sends the verification email. Always answers with the same generic
   * message so it can't be used to discover which emails are registered, and
   * silently skips within the cooldown window to stop mail flooding.
   */
  async resendVerification(body: ResendVerificationDto) {
    const genericResponse = {
      message:
        'If an unverified account exists for this email, a new verification link has been sent.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!user || user.isEmailVerified) return genericResponse;

    const latest = await this.prisma.verification.findFirst({
      where: { userId: user.id, type: VerificationType.EMAIL_VERIFICATION },
      orderBy: { createdAt: 'desc' },
    });
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < RESEND_VERIFICATION_COOLDOWN_MS
    ) {
      return genericResponse;
    }

    await this.sendVerificationEmail(user);
    return genericResponse;
  }

  /**
   * Sign in an existing user and return JWT access token
   */
  async signIn(body: LoginDto) {
    const { email, password } = body;

    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // No actor or email stored: the log shouldn't collect addresses people mistyped.
      await this.recordFailedSignIn('unknown_account');
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.recordFailedSignIn('wrong_password', user);
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Check if email is verified
    if (!user.isEmailVerified) {
      await this.recordFailedSignIn('email_not_verified', user);
      throw new UnauthorizedException({
        message: 'Please verify your email address before signing in.',
        code: EMAIL_NOT_VERIFIED_CODE,
      });
    }

    // 4. Block suspended accounts
    if (user.isSuspended) {
      await this.recordFailedSignIn('account_suspended', user);
      throw new ForbiddenException({
        message: 'This account has been suspended. Contact support for help.',
        code: ACCOUNT_SUSPENDED_CODE,
      });
    }

    // 5. Generate JWT access + refresh token pair
    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_SIGN_IN,
      actor: { id: user.id, role: user.role },
      targetType: AUDIT_TARGETS.USER,
      targetId: user.id,
    });
    this.logger.log(`🔑 User signed in successfully: ${user.email}`);
    return this.createSession(user, body.clientType);
  }

  private recordFailedSignIn(
    reason: string,
    user?: { id: string; role: UserRole },
  ): Promise<void> {
    return this.audit.record({
      action: AUDIT_ACTIONS.AUTH_SIGN_IN_FAILED,
      actor: user ? { id: user.id, role: user.role } : undefined,
      targetType: user ? AUDIT_TARGETS.USER : undefined,
      targetId: user?.id,
      metadata: { reason },
    });
  }

  /**
   * The sign-in response shared by password and OAuth sign-in: a fresh
   * access/refresh token pair plus the public user profile.
   */
  async createSession(
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      referralCode: string | null;
      isEmailVerified: boolean;
      mustChangePassword: boolean;
      createdAt: Date;
    },
    clientType: ClientType = 'web',
  ) {
    const { accessToken, refreshToken } = await this.issueTokenPair(
      user,
      clientType,
    );

    return {
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        referralCode: user.referralCode,
        isEmailVerified: user.isEmailVerified,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Verify User Email via link token
   */
  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }

    // 1. Find verification record in DB
    const verification = await this.prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (
      !verification ||
      verification.type !== VerificationType.EMAIL_VERIFICATION
    ) {
      throw new BadRequestException(
        'Invalid or non-existent verification link',
      );
    }

    // 2. Check token expiration
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        'Verification link has expired. Please request a new verification link.',
      );
    }

    // 3. Mark user as verified and delete the used verification record
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.verification.delete({
        where: { id: verification.id },
      }),
    ]);

    this.logger.log(
      `✅ Email verified successfully for user: ${verification.user.email}`,
    );

    return {
      message: 'Email address verified successfully. You can now log in.',
    };
  }

  /**
   * Initiate Forgot Password flow (generates random link token with 1 hour expiration)
   */
  async forgetPassword(body: ForgetPasswordDto) {
    const { email } = body;

    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException(
        'User with this email address does not exist',
      );
    }

    // 2. Generate 32-byte hex token and set 1-hour expiry (1 * 60 * 60 * 1000 ms)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

    // 3. Delete existing PASSWORD_RESET tokens for this user
    await this.prisma.verification.deleteMany({
      where: {
        userId: user.id,
        type: VerificationType.PASSWORD_RESET,
      },
    });

    // 4. Create new Verification record
    await this.prisma.verification.create({
      data: {
        userId: user.id,
        type: VerificationType.PASSWORD_RESET,
        token,
        expiresAt,
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
      actor: { id: user.id, role: user.role },
      targetType: AUDIT_TARGETS.USER,
      targetId: user.id,
    });

    // 5. Send password reset link email via NotificationService
    // APP_URL is the frontend's origin — see the matching note in signUp().
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-password?token=${token}`;
    await this.notificationService.sendPasswordResetLinkEmail(
      user.email,
      user.name,
      resetLink,
    );

    return {
      message: 'Password reset link has been sent to your email address.',
    };
  }

  /**
   * Complete Reset Password using the link token and new password
   */
  async resetPassword(body: ResetPasswordDto) {
    const { token, newPassword } = body;

    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    // 1. Find matching PASSWORD_RESET verification token
    const verification = await this.prisma.verification.findUnique({
      where: { token },
      include: { user: true },
    });

    if (
      !verification ||
      verification.type !== VerificationType.PASSWORD_RESET
    ) {
      throw new BadRequestException(
        'Invalid or non-existent password reset link',
      );
    }

    // 2. Check if token has expired
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException(
        'Password reset link has expired. Please request a new password reset.',
      );
    }

    // 3. Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update user password and delete used verification record
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.verification.delete({
        where: { id: verification.id },
      }),
    ]);

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET,
      actor: { id: verification.user.id, role: verification.user.role },
      targetType: AUDIT_TARGETS.USER,
      targetId: verification.user.id,
    });
    this.logger.log(
      `✅ Password reset successfully for user: ${verification.user.email}`,
    );

    return {
      message:
        'Password reset successfully. You can now log in with your new password.',
    };
  }

  /**
   * Sets a new password for the logged-in user and clears mustChangePassword.
   * Used both for a voluntary change and for the forced first-login change
   * on accounts created with a temporary password (see creator.service.ts).
   */
  async changePassword(userId: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
      targetType: AUDIT_TARGETS.USER,
      targetId: userId,
    });
    this.logger.log(`🔑 Password changed for user ${userId}`);

    return { message: 'Password changed successfully.' };
  }

  /**
   * Rotates a refresh token: verifies its signature, checks it against the
   * hashed DB record (unrevoked, unexpired), revokes it, and issues a brand
   * new access/refresh pair. Rotation on every use means a stolen refresh
   * token becomes unusable the moment the legitimate client refreshes again.
   */
  /** Signs the user out everywhere: used on token theft and suspension. */
  private async revokeAllRefreshTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token after the
   * multi-tab grace window means a copy was stolen, so every session for that
   * user is revoked and they must sign in again.
   */
  async refreshTokens(dto: RefreshTokenDto) {
    const { refreshToken } = dto;
    const invalid = new UnauthorizedException(
      'Invalid or expired refresh token',
    );

    let payload: { sub: string; ct?: ClientType };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      });
    } catch {
      throw invalid;
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    if (!storedToken || storedToken.expiresAt < new Date()) throw invalid;

    if (storedToken.revokedAt) {
      const revokedAgoMs = Date.now() - storedToken.revokedAt.getTime();
      if (revokedAgoMs <= REFRESH_REUSE_GRACE_MS) throw invalid;

      await this.revokeAllRefreshTokens(storedToken.userId);
      await this.audit.record({
        action: AUDIT_ACTIONS.AUTH_REFRESH_TOKEN_REUSED,
        actor: { id: storedToken.userId },
        targetType: AUDIT_TARGETS.USER,
        targetId: storedToken.userId,
        metadata: { outcome: 'all_sessions_revoked' },
      });
      this.logger.warn(
        `🚨 Refresh token reuse detected for user ${storedToken.userId}; all sessions revoked`,
      );
      throw new UnauthorizedException({
        message: 'Your session was ended for security. Please sign in again.',
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
    });
    if (!user) throw new UnauthorizedException('User no longer exists');
    if (user.isSuspended) {
      await this.revokeAllRefreshTokens(user.id);
      throw new ForbiddenException({
        message: 'This account has been suspended. Contact support for help.',
        code: ACCOUNT_SUSPENDED_CODE,
      });
    }

    // Atomic: only one concurrent request can rotate a given token.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) throw invalid;

    const tokens = await this.issueTokenPair(user, payload.ct ?? 'web');
    this.logger.log(`🔄 Refresh token rotated for user: ${user.email}`);

    return {
      message: 'Token refreshed successfully',
      ...tokens,
    };
  }

  async logout(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, revokedAt: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (storedToken && !storedToken.revokedAt) {
      await this.audit.record({
        action: AUDIT_ACTIONS.AUTH_SIGN_OUT,
        actor: { id: storedToken.userId },
        targetType: AUDIT_TARGETS.USER,
        targetId: storedToken.userId,
      });
    }

    return { message: 'Logged out successfully' };
  }
}
