import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  /**
   * Admin onboarding for a new Creator / Instructor account.
   * Generates a random password and sends credentials via email.
   */
  async createCreator(dto: CreateCreatorDto) {
    const { email, name, phone, country, fieldOfExpertise, teachingExperience, availability } = dto;

    // 1. Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException('A user or creator with this email address already exists');
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

    // 5. Email login credentials to the creator
    await this.notificationService.sendCreatorCredentialsEmail(creator.email, creator.name, tempPassword);

    this.logger.log(`🎨 Creator account onboarded successfully by Admin: ${creator.email}`);

    return {
      message: 'Creator onboarded successfully. Credentials have been sent to their email.',
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
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      total: creators.length,
      creators,
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
        createdAt: true,
      },
    }); 

    if (!creator) {
      throw new NotFoundException(`Creator with ID "${id}" not found`);
    }

    return creator;
  }
}
