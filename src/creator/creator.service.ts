import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../audit/audit-actions';
import { NotificationService } from '../notification/notification.service';
import { CreateCreatorDto } from './dto/create-creator.dto';
import { generateRandomPassword, generateReferralCode } from '../utils';
import { UserRole } from '../generated/prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CreatorService {
  private readonly logger = new Logger(CreatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Admin onboarding for a new Creator / Instructor account.
   * Generates a random password and sends credentials via email.
   */
  async createCreator(dto: CreateCreatorDto) {
    const {
      email,
      name,
      phone,
      country,
      fieldOfExpertise,
      teachingExperience,
      availability,
      wasApplicant,
    } = dto;

    // 1. Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException(
        'A user or creator with this email address already exists',
      );
    }

    // 2. Generate temporary password and hash it
    const tempPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 3. Generate referral code
    const referralCode = generateReferralCode(8, 'CREATOR');

    // 4. Create User record with role INSTRUCTOR and isEmailVerified true
    const creator = await this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        referralCode,
        role: UserRole.INSTRUCTOR,
        isEmailVerified: true,
        mustChangePassword: true,
        phone,
        country,
        fieldOfExpertise,
        teachingExperience,
        availability,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        country: true,
        fieldOfExpertise: true,
        teachingExperience: true,
        availability: true,
        referralCode: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.CREATOR_CREATED,
      targetType: AUDIT_TARGETS.USER,
      targetId: creator.id,
      metadata: { wasApplicant },
    });

    // 5. Email login credentials to the creator
    await this.notificationService.sendCreatorCredentialsEmail(
      creator.email,
      creator.name,
      tempPassword,
      wasApplicant,
    );

    this.logger.log(
      `🎨 Creator account onboarded successfully by Admin: ${creator.email}`,
    );

    return {
      message:
        'Creator onboarded successfully. Credentials have been sent to their email.',
      creator,
    };
  }

  /**
   * Get list of all creators / instructors
   */
  async getCreators() {
    const creators = await this.prisma.user.findMany({
      where: {
        role: UserRole.INSTRUCTOR,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        country: true,
        fieldOfExpertise: true,
        teachingExperience: true,
        availability: true,
        referralCode: true,
        isEmailVerified: true,
        isSuspended: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const creatorsWithRatings = await Promise.all(
      creators.map(async (creator) => ({
        ...creator,
        ...(await this.getCreatorRating(creator.id)),
      })),
    );

    return {
      total: creators.length,
      creators: creatorsWithRatings,
    };
  }

  /**
   * A creator's overall rating is the average across every review left on
   * any of their courses (see ReviewModule) — courses are the reviewable
   * unit, so this is a computed aggregate rather than a stored field.
   */
  private async getCreatorRating(
    creatorId: string,
  ): Promise<{ rating: number; reviewsCount: number }> {
    const aggregate = await this.prisma.review.aggregate({
      where: { course: { creatorId } },
      _avg: { rating: true },
      _count: true,
    });

    return {
      rating: aggregate._avg.rating ?? 0,
      reviewsCount: aggregate._count,
    };
  }

  /**
   * Get single creator profile by ID
   */
  async getCreatorById(id: string) {
    const creator = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.INSTRUCTOR,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        country: true,
        fieldOfExpertise: true,
        teachingExperience: true,
        availability: true,
        referralCode: true,
        isEmailVerified: true,
        isSuspended: true,
        createdAt: true,
      },
    });

    if (!creator) {
      throw new NotFoundException(`Creator with ID "${id}" not found`);
    }

    return { ...creator, ...(await this.getCreatorRating(creator.id)) };
  }
}
