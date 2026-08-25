import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { RegisterDto } from './dto/register.dto';
import { generateReferralCode } from '../utils';
import { UserRole, VerificationType } from '../generated/prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Register a new user and send an email verification link
   */
  async signUp(body: RegisterDto) {
    const { email, name, password, role } = body;

    // 1. Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
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
    console.log(token)
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
    const appUrl = process.env.APP_URL;
    const verificationLink = `${appUrl}/auth/verify-email?token=${token}`;
    await this.notificationService.sendEmailVerirfaction(user.email, user.name, verificationLink)

    return {
      message: 'Registration successful! Please check your email to verify your account.',
      userId: user.id,
      email: user.email,
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
}
