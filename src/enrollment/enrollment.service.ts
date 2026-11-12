import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseCourseDto } from './dto/purchase-course.dto';
import { DiscountService } from '../discount/discount.service';
import { BadgesService } from '../badges/badges.service';
import { ReferralService } from '../referral/referral.service';
import {
  CreditTransactionType,
  DiscountTarget,
  EnrollmentStatus,
  EnrollmentType,
  CourseStatus,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';
import { USD_PER_CREDIT } from '../credit/credit.service';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import {
  ENROLLMENT_ACCESS_STATUSES,
  hasEnrollmentAccess,
} from './enrollment-access';
import { programSalesPhase } from '../course/program-schedule';
import { formatDateOnly } from '../utils';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discountService: DiscountService,
    private readonly badgesService: BadgesService,
    private readonly referrals: ReferralService,
  ) {}

  /**
   * Calculate course and module credit requirements
   */
  calculateCourseCredits(tuitionFee: number): number {
    return Math.ceil(tuitionFee / USD_PER_CREDIT);
  }

  /**
   * Purchase a Course (Full Course or Module-by-Module) using user's Credit Wallet
   */
  async purchaseWithCredits(userId: string, dto: PurchaseCourseDto) {
    const { courseId, type, discountCode } = dto;
    const requestedModuleIds = [
      ...new Set(dto.moduleIds ?? (dto.moduleId ? [dto.moduleId] : [])),
    ];
    const now = new Date();

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
        modules: { orderBy: MODULE_ORDER_BY },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }
    if (course.status !== CourseStatus.ACTIVE) {
      throw new BadRequestException(
        'This course is not open for enrollment yet.',
      );
    }

    const totalModules = course.modules.length;
    if (totalModules === 0) {
      throw new BadRequestException(
        'This course does not have any modules configured yet.',
      );
    }

    // 3. Compute credit costs
    const courseTotalCredits = this.calculateCourseCredits(course.tuitionFee);
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
      hasEnrollmentAccess(existingEnrollment.status) &&
      existingEnrollment.type === EnrollmentType.FULL_COURSE
    ) {
      throw new ConflictException(
        'You already own full access to this course.',
      );
    }

    const seat = this.resolveSeat(
      course,
      Boolean(
        existingEnrollment && hasEnrollmentAccess(existingEnrollment.status),
      ),
      now,
    );

    let requiredCredits: number;
    let targetModuleIds: string[] = [];
    let txType: CreditTransactionType;
    let description: string;
    let targetModuleTitles: string[] = [];

    if (type === EnrollmentType.FULL_COURSE) {
      requiredCredits = courseTotalCredits;
      txType = CreditTransactionType.COURSE_PURCHASE;
      description = `Full course purchase: "${course.name}"`;
    } else if (type === EnrollmentType.MODULAR) {
      if (requestedModuleIds.length === 0) {
        throw new BadRequestException(
          'Choose at least one module to purchase.',
        );
      }

      const targetModules = requestedModuleIds.map((id) => {
        const module = course.modules.find((m) => m.id === id);
        if (!module) {
          throw new BadRequestException(
            `Module with ID "${id}" does not belong to this course.`,
          );
        }
        return module;
      });

      const owned = new Set(
        existingEnrollment?.enrolledModules.map((em) => em.moduleId) ?? [],
      );
      const alreadyOwned = targetModules.filter((m) => owned.has(m.id));
      if (alreadyOwned.length > 0) {
        throw new ConflictException(
          `You have already purchased ${alreadyOwned.map((m) => `"${m.title}"`).join(', ')}.`,
        );
      }

      targetModuleTitles = targetModules.map((m) => m.title);
      requiredCredits = moduleCredits * targetModules.length;
      targetModuleIds = targetModules.map((m) => m.id);
      txType = CreditTransactionType.MODULE_PURCHASE;
      description = `Module purchase: ${targetModuleTitles.map((title) => `"${title}"`).join(', ')} (${course.name})`;
    } else {
      throw new BadRequestException('Invalid enrollment type');
    }

    // 5. Apply the discount code, if any, then verify sufficient balance
    const fullPriceCredits = requiredCredits;
    if (discountCode) {
      const preview = await this.discountService.resolveDiscount(
        userId,
        discountCode,
        DiscountTarget.COURSE_PURCHASE,
        fullPriceCredits,
      );
      requiredCredits = preview.finalAmount;
    }
    // The referee discount never stacks with a code; it waits for a purchase without one.
    const referralDiscount = discountCode
      ? 0
      : await this.referrals.discountFor(userId, fullPriceCredits);
    requiredCredits -= referralDiscount;

    if (user.credits < requiredCredits) {
      const shortBy = requiredCredits - user.credits;
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Insufficient credit balance to purchase this ${type === EnrollmentType.FULL_COURSE ? 'course' : 'module'}.`,
        requiredCredits,
        availableCredits: user.credits,
        shortByCredits: shortBy,
        requiredUsd: requiredCredits * USD_PER_CREDIT,
        availableUsd: user.credits * USD_PER_CREDIT,
        shortByUsd: shortBy * USD_PER_CREDIT,
        action: 'Please top up your wallet credits via POST /credits/buy',
      });
    }

    if (seat.isNew && seat.phase === 'OPEN') {
      // Checked again under a row lock inside the transaction; this early check
      // just saves a round of discount and balance work for a full program.
      await this.assertSeatAvailable(this.prisma, courseId, seat.seatCap);
    }

    const txReference = `JOS-PUR-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

    // 6. Execute atomic deduction, transaction log, and enrollment activation
    const result = await this.prisma.$transaction(async (tx) => {
      if (seat.isNew && seat.phase === 'OPEN') {
        // Lock the program row so two buyers can't both take the last seat.
        await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${courseId} FOR UPDATE`;
        await this.assertSeatAvailable(tx, courseId, seat.seatCap);
      }

      // Re-check the code inside the transaction so concurrent purchases
      // cannot exceed its limits, then record the redemption.
      let discountAmount = 0;
      if (discountCode) {
        const applied = await this.discountService.resolveDiscount(
          userId,
          discountCode,
          DiscountTarget.COURSE_PURCHASE,
          fullPriceCredits,
          tx,
        );
        discountAmount = applied.discountAmount;
        await this.discountService.recordRedemption(tx, {
          campaignId: applied.campaignId,
          userId,
          target: DiscountTarget.COURSE_PURCHASE,
          originalAmount: applied.originalAmount,
          discountAmount: applied.discountAmount,
          finalAmount: applied.finalAmount,
          reference: txReference,
        });
      }

      if (
        referralDiscount > 0 &&
        !(await this.referrals.claimDiscount(tx, userId))
      ) {
        throw new ConflictException(
          'Your referral discount was just used on another purchase. Please try again.',
        );
      }

      // The balance guard makes the deduction atomic: two racing purchases can't both pass the earlier read-time check and overdraw the wallet.
      const { count: debited } = await tx.user.updateMany({
        where: { id: userId, credits: { gte: requiredCredits } },
        data: { credits: { decrement: requiredCredits } },
      });
      if (debited === 0) {
        throw new BadRequestException(
          'Not enough credits for this purchase. Your balance changed; please check it and try again.',
        );
      }
      const updatedUser = await tx.user.findUniqueOrThrow({
        where: { id: userId },
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
          // A single-module purchase keeps pointing at its module; a bundle lists them in the description.
          moduleId: targetModuleIds.length === 1 ? targetModuleIds[0] : null,
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
      } else if (targetModuleIds.length > 0) {
        for (const moduleId of targetModuleIds) {
          await tx.enrolledModule.upsert({
            where: {
              enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId },
            },
            create: { enrollmentId: enrollment.id, moduleId },
            update: {},
          });
        }

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
        discountAmount,
      };
    });

    this.logger.log(
      `🎉 Purchase successful for ${user.email}: Course "${course.name}", Type: ${type}, Credits Deducted: ${requiredCredits}, New Balance: ${result.user.credits}`,
    );

    await this.badgesService.evaluateEnrollmentPurchase(userId, type);

    return {
      message: `${
        type === EnrollmentType.FULL_COURSE
          ? 'Course'
          : targetModuleTitles.length === 1
            ? `Module "${targetModuleTitles[0]}"`
            : `${targetModuleTitles.length} modules`
      } purchased successfully with credits!`,
      courseId: course.id,
      courseName: course.name,
      purchaseType: type,
      moduleId: targetModuleIds[0] ?? null,
      moduleIds: targetModuleIds,
      creditsDeducted: requiredCredits,
      originalCredits: fullPriceCredits,
      discountCredits: result.discountAmount,
      referralDiscountCredits: referralDiscount,
      remainingBalance: result.user.credits,
      remainingUsdEquivalent: result.user.credits * USD_PER_CREDIT,
      reference: txReference,
      enrollmentId: result.enrollment.id,
    };
  }

  /**
   * A program is one cohort. New seats (capped by maxCohortSize) are sold until
   * enrollment closes, then again with no cap once it ends, as a rewatch. Learners
   * who already have a seat can buy their remaining modules at any time.
   */
  private resolveSeat(
    course: {
      maxCohortSize: number;
      enrollmentClosesAt: Date | null;
      endsAt: Date | null;
    },
    hasSeat: boolean,
    now: Date,
  ) {
    const phase = programSalesPhase(course, now);
    const isNew = !hasSeat;
    if (isNew && phase === 'CLOSED' && course.endsAt) {
      throw new BadRequestException(
        `Enrollment for this program has closed. It reopens as a rewatch on ${formatDateOnly(course.endsAt)}.`,
      );
    }
    return { phase, isNew, seatCap: course.maxCohortSize };
  }

  private async assertSeatAvailable(
    db: Pick<PrismaService, 'enrollment'>,
    courseId: string,
    seatCap: number,
  ): Promise<void> {
    const taken = await db.enrollment.count({
      where: { courseId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
    });
    if (taken >= seatCap) {
      throw new ConflictException('This program is full.');
    }
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
            modules: { orderBy: MODULE_ORDER_BY },
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
      enrollments: await Promise.all(
        enrollments.map(async (enr) => {
          const unlockedModules =
            enr.type === EnrollmentType.FULL_COURSE
              ? enr.course.modules
              : enr.enrolledModules.map((em) => em.module);
          const progress = await this.getLessonProgress(
            userId,
            unlockedModules.map((module) => module.id),
          );
          return {
            id: enr.id,
            courseId: enr.courseId,
            courseName: enr.course.name,
            heroImage: enr.course.heroImageName,
            category: enr.course.category?.name || null,
            type: enr.type,
            status: enr.status,
            totalCourseModules: enr.course.modules.length,
            unlockedModulesCount: unlockedModules.length,
            unlockedModules,
            ...progress,
            createdAt: enr.createdAt,
          };
        }),
      ),
    };
  }

  /**
   * Lessons finished out of the lessons the learner can open. "Progress" means
   * lessons completed, not modules bought (that is unlockedModulesCount).
   */
  private async getLessonProgress(userId: string, moduleIds: string[]) {
    const [totalLessonsCount, completedLessonsCount] = await Promise.all([
      this.prisma.lesson.count({ where: { moduleId: { in: moduleIds } } }),
      this.prisma.lessonProgress.count({
        where: {
          userId,
          completed: true,
          lesson: { moduleId: { in: moduleIds } },
        },
      }),
    ]);
    return {
      completedLessonsCount,
      totalLessonsCount,
      progressPercent:
        totalLessonsCount > 0
          ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
          : 0,
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

    if (!enrollment || !hasEnrollmentAccess(enrollment.status)) {
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
