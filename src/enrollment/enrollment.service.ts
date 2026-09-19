import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseCourseDto } from './dto/purchase-course.dto';
import {
  CreditTransactionType,
  EnrollmentStatus,
  EnrollmentType,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';
import { NAIRA_PER_CREDIT } from '../credit/credit.service';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate course and module credit requirements
   */
  calculateCourseCredits(tuitionFee: number, costCredit?: number | null) {
    const courseCredits =
      costCredit && costCredit > 0
        ? costCredit
        : Math.ceil(tuitionFee / NAIRA_PER_CREDIT);
    return courseCredits;
  }

  /**
   * Purchase a Course (Full Course or Module-by-Module) using user's Credit Wallet
   */
  async purchaseWithCredits(userId: string, dto: PurchaseCourseDto) {
    const { courseId, type, moduleId } = dto;

    // 1. Fetch user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Fetch course with modules
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }

    const totalModules = course.modules.length;
    if (totalModules === 0) {
      throw new BadRequestException(
        'This course does not have any modules configured yet.',
      );
    }

    // 3. Compute credit costs
    const courseTotalCredits = this.calculateCourseCredits(
      course.tuitionFee,
      course.costCredit,
    );
    const moduleCredits = Math.ceil(courseTotalCredits / totalModules);

    // 4. Check existing enrollment
    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      include: {
        enrolledModules: true,
      },
    });

    if (
      existingEnrollment &&
      existingEnrollment.status === EnrollmentStatus.ACTIVE &&
      existingEnrollment.type === EnrollmentType.FULL_COURSE
    ) {
      throw new ConflictException(
        'You already own full access to this course.',
      );
    }

    let requiredCredits: number;
    let targetModuleId: string | null = null;
    let txType: CreditTransactionType;
    let description: string;
    let targetModuleTitle = '';

    if (type === EnrollmentType.FULL_COURSE) {
      requiredCredits = courseTotalCredits;
      txType = CreditTransactionType.COURSE_PURCHASE;
      description = `Full course purchase: "${course.name}"`;
    } else if (type === EnrollmentType.MODULAR) {
      if (!moduleId) {
        throw new BadRequestException(
          'moduleId is required when purchasing a specific module.',
        );
      }

      const targetModule = course.modules.find((m) => m.id === moduleId);
      if (!targetModule) {
        throw new BadRequestException(
          `Module with ID "${moduleId}" does not belong to this course.`,
        );
      }

      targetModuleTitle = targetModule.title;

      // Check if module is already unlocked
      if (existingEnrollment) {
        const alreadyUnlocked = existingEnrollment.enrolledModules.some(
          (em) => em.moduleId === moduleId,
        );
        if (alreadyUnlocked) {
          throw new ConflictException(
            `You have already purchased module "${targetModule.title}".`,
          );
        }
      }

      requiredCredits = moduleCredits;
      targetModuleId = moduleId;
      txType = CreditTransactionType.MODULE_PURCHASE;
      description = `Module purchase: "${targetModule.title}" (${course.name})`;
    } else {
      throw new BadRequestException('Invalid enrollment type');
    }

    // 5. Verify user has sufficient credit balance
    if (user.credits < requiredCredits) {
      const shortBy = requiredCredits - user.credits;
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Insufficient credit balance to purchase this ${type === EnrollmentType.FULL_COURSE ? 'course' : 'module'}.`,
        requiredCredits,
        availableCredits: user.credits,
        shortByCredits: shortBy,
        requiredNaira: requiredCredits * NAIRA_PER_CREDIT,
        availableNaira: user.credits * NAIRA_PER_CREDIT,
        shortByNaira: shortBy * NAIRA_PER_CREDIT,
        action: 'Please top up your wallet credits via POST /credits/buy',
      });
    }

    const txReference = `JOS-PUR-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

    // 6. Execute atomic deduction, transaction log, and enrollment activation
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct credits from user wallet
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          credits: { decrement: requiredCredits },
        },
      });

      // Record credit transaction
      const creditTx = await tx.creditTransaction.create({
        data: {
          userId,
          amount: -requiredCredits,
          balanceAfter: updatedUser.credits,
          type: txType,
          description,
          reference: txReference,
          courseId,
          moduleId: targetModuleId,
        },
      });

      // Upsert Enrollment record
      let enrollment = await tx.enrollment.upsert({
        where: {
          userId_courseId: { userId, courseId },
        },
        create: {
          userId,
          courseId,
          type,
          status: EnrollmentStatus.ACTIVE,
        },
        update: {
          status: EnrollmentStatus.ACTIVE,
          ...(type === EnrollmentType.FULL_COURSE
            ? { type: EnrollmentType.FULL_COURSE }
            : {}),
        },
      });

      // Unlock modules
      if (type === EnrollmentType.FULL_COURSE) {
        // Unlock all modules in course
        for (const mod of course.modules) {
          await tx.enrolledModule.upsert({
            where: {
              enrollmentId_moduleId: {
                enrollmentId: enrollment.id,
                moduleId: mod.id,
              },
            },
            create: {
              enrollmentId: enrollment.id,
              moduleId: mod.id,
            },
            update: {},
          });
        }
      } else if (targetModuleId) {
        // Unlock the specific module
        await tx.enrolledModule.upsert({
          where: {
            enrollmentId_moduleId: {
              enrollmentId: enrollment.id,
              moduleId: targetModuleId,
            },
          },
          create: {
            enrollmentId: enrollment.id,
            moduleId: targetModuleId,
          },
          update: {},
        });

        // Check if student now unlocked all modules
        const unlockedCount = await tx.enrolledModule.count({
          where: { enrollmentId: enrollment.id },
        });

        if (unlockedCount >= totalModules) {
          enrollment = await tx.enrollment.update({
            where: { id: enrollment.id },
            data: { type: EnrollmentType.FULL_COURSE },
          });
        }
      }

      return {
        user: updatedUser,
        creditTx,
        enrollment,
      };
    });

    this.logger.log(
      `🎉 Purchase successful for ${user.email}: Course "${course.name}", Type: ${type}, Credits Deducted: ${requiredCredits}, New Balance: ${result.user.credits}`,
    );

    return {
      message: `${type === EnrollmentType.FULL_COURSE ? 'Course' : `Module "${targetModuleTitle}"`} purchased successfully with credits!`,
      courseId: course.id,
      courseName: course.name,
      purchaseType: type,
      moduleId: targetModuleId,
      creditsDeducted: requiredCredits,
      remainingBalance: result.user.credits,
      remainingNairaEquivalent: result.user.credits * NAIRA_PER_CREDIT,
      reference: txReference,
      enrollmentId: result.enrollment.id,
    };
  }

  /**
   * Get all active & pending enrollments for the logged-in student
   */
  async getMyEnrollments(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: true,
            modules: true,
          },
        },
        enrolledModules: {
          include: {
            module: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      total: enrollments.length,
      enrollments: enrollments.map((enr) => ({
        id: enr.id,
        courseId: enr.courseId,
        courseName: enr.course.name,
        heroImage: enr.course.heroImageName,
        category: enr.course.category?.name || null,
        type: enr.type,
        status: enr.status,
        totalCourseModules: enr.course.modules.length,
        unlockedModulesCount:
          enr.type === EnrollmentType.FULL_COURSE
            ? enr.course.modules.length
            : enr.enrolledModules.length,
        unlockedModules:
          enr.type === EnrollmentType.FULL_COURSE
            ? enr.course.modules
            : enr.enrolledModules.map((em) => em.module),
        createdAt: enr.createdAt,
      })),
    };
  }

  /**
   * Check if student has unlocked access to a specific module
   */
  async checkModuleAccess(
    userId: string,
    courseId: string,
    moduleId: string,
  ): Promise<{ hasAccess: boolean; enrollmentType?: EnrollmentType }> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      include: {
        enrolledModules: true,
      },
    });

    if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) {
      return { hasAccess: false };
    }

    if (enrollment.type === EnrollmentType.FULL_COURSE) {
      return { hasAccess: true, enrollmentType: EnrollmentType.FULL_COURSE };
    }

    const hasUnlockedModule = enrollment.enrolledModules.some(
      (em) => em.moduleId === moduleId,
    );

    return {
      hasAccess: hasUnlockedModule,
      enrollmentType: EnrollmentType.MODULAR,
    };
  }
}
