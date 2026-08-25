import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateOtp, generateReferralCode } from '../utils';
import { UserRole, VerificationType } from '../generated/prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Register a new user and send an email verification link
   */
  async signUp(body: RegisterDto) {
    const { email, name, password, role } = body;

    // 1. Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException('User with this email address already exists');
    }

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
        role: role || UserRole.USER,
        isEmailVerified: false,
      },
    });

    // 5. Generate secure random verification token for email link
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

    // 6. Save verification token record in DB
    await this.prisma.verification.create({
      data: {
        userId: user.id,
        type: VerificationType.EMAIL_VERIFICATION,
        token,
        expiresAt,
      },
    });

    // 7. Send Email Verification Link via NotificationService
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationLink = `${appUrl}/auth/verify-email?token=${token}`;
    await this.notificationService.sendEmailVerirfaction(user.email, user.name, verificationLink);

    return {
      message: 'Registration successful! Please check your email to verify your account.',
      userId: user.id,
      email: user.email,
    };
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
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Check if email is verified
    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email address before signing in.');
    }

    // 4. Generate JWT Access Token
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log(`🔑 User signed in successfully: ${user.email}`);

    return {
      message: 'Login successful',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        referralCode: user.referralCode,
        isEmailVerified: user.isEmailVerified,
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

    if (!verification || verification.type !== VerificationType.EMAIL_VERIFICATION) {
      throw new BadRequestException('Invalid or non-existent verification link');
    }

    // 2. Check token expiration
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Verification link has expired. Please request a new verification link.');
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

    this.logger.log(`✅ Email verified successfully for user: ${verification.user.email}`);

    return {
      message: 'Email address verified successfully. You can now log in.',
    };
  }

  /**
   * Initiate Forgot Password flow (generates 6-digit OTP with 1 hour expiration)
   */
  async forgetPassword(body: ForgetPasswordDto) {
    const { email } = body;

    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('User with this email address does not exist');
    }

    // 2. Generate 6-digit OTP and set 1-hour expiry (1 * 60 * 60 * 1000 ms)
    const token = generateOtp(6);
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour expiry

    // 3. Delete existing PASSWORD_RESET tokens for this user, then create a new one
    await this.prisma.verification.deleteMany({
      where: {
        userId: user.id,
        type: VerificationType.PASSWORD_RESET,
      },
    });

    await this.prisma.verification.create({
      data: {
        userId: user.id,
        type: VerificationType.PASSWORD_RESET,
        token,
        expiresAt,
      },
    });

    // 4. Send OTP email via NotificationService
    await this.notificationService.sendPasswordResetOtpEmail(user.email, token);

    return {
      message: 'Password reset OTP code has been sent to your email address.',
    };
  }

  /**
   * Complete Reset Password using the 6-digit OTP code and new password
   */
  async resetPassword(body: ResetPasswordDto) {
    const { email, otp, newPassword } = body;

    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('User with this email address does not exist');
    }

    // 2. Find matching PASSWORD_RESET verification token
    const verification = await this.prisma.verification.findFirst({
      where: {
        userId: user.id,
        token: otp,
        type: VerificationType.PASSWORD_RESET,
      },
    });

    if (!verification) {
      throw new BadRequestException('Invalid OTP code');
    }

    // 3. Check if OTP has expired
    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('OTP code has expired. Please request a new password reset.');
    }

    // 4. Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 5. Update user password and delete used verification record
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      this.prisma.verification.delete({
        where: { id: verification.id },
      }),
    ]);

    this.logger.log(`✅ Password reset successfully for user: ${user.email}`);

    return {
      message: 'Password reset successfully. You can now log in with your new password.',
    };
  }
}
