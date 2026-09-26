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
  CohortStatus,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';
import { NAIRA_PER_CREDIT } from '../credit/credit.service';
import { MODULE_ORDER_BY } from '../course-module/module-order';
import {
  ENROLLMENT_ACCESS_STATUSES,
  hasEnrollmentAccess,
} from './enrollment-access';
import { cohortSalesPhase } from '../cohort/cohort-phase';
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
    const { courseId, type, moduleId, discountCode } = dto;
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
      hasEnrollmentAccess(existingEnrollment.status) &&
      existingEnrollment.type === EnrollmentType.FULL_COURSE
    ) {
      throw new ConflictException(
        'You already own full access to this course.',
      );
    }

    const seat = await this.resolveCohortSeat(
      existingEnrollment?.cohortId ?? null,
      dto,
      now,
    );

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
        requiredNaira: requiredCredits * NAIRA_PER_CREDIT,
        availableNaira: user.credits * NAIRA_PER_CREDIT,
        shortByNaira: shortBy * NAIRA_PER_CREDIT,
        action: 'Please top up your wallet credits via POST /credits/buy',
      });
    }

    if (seat.isNew && seat.phase === 'OPEN') {
      // Checked again under a row lock inside the transaction; this early check
      // just saves a round of discount and balance work for a full cohort.
      await this.assertSeatAvailable(this.prisma, seat.cohortId, seat.seatCap);
    }

    const txReference = `JOS-PUR-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

    // 6. Execute atomic deduction, transaction log, and enrollment activation
    const result = await this.prisma.$transaction(async (tx) => {
      if (seat.isNew && seat.phase === 'OPEN') {
        // Lock the cohort row so two buyers can't both take the last seat.
        await tx.$queryRaw`SELECT id FROM "Cohort" WHERE id = ${seat.cohortId} FOR UPDATE`;
        await this.assertSeatAvailable(tx, seat.cohortId, seat.seatCap);
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
          cohortId: seat.cohortId,
          type,
          status: EnrollmentStatus.ACTIVE,
        },
        update: {
          cohortId: seat.cohortId,
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
        discountAmount,
      };
    });

    this.logger.log(
      `🎉 Purchase successful for ${user.email}: Course "${course.name}", Type: ${type}, Credits Deducted: ${requiredCredits}, New Balance: ${result.user.credits}`,
    );

    await this.badgesService.evaluateEnrollmentPurchase(userId, type);

    return {
      message: `${type === EnrollmentType.FULL_COURSE ? 'Course' : `Module "${targetModuleTitle}"`} purchased successfully with credits!`,
      courseId: course.id,
      courseName: course.name,
      purchaseType: type,
      moduleId: targetModuleId,
      creditsDeducted: requiredCredits,
      originalCredits: fullPriceCredits,
      discountCredits: result.discountAmount,
      referralDiscountCredits: referralDiscount,
      remainingBalance: result.user.credits,
      remainingNairaEquivalent: result.user.credits * NAIRA_PER_CREDIT,
      reference: txReference,
      enrollmentId: result.enrollment.id,
      cohortId: seat.cohortId,
    };
  }

  /**
   * Which cohort this purchase lands in. A learner keeps one seat per program:
   * the first purchase picks a cohort, later ones stay in it. New seats are sold
   * while a cohort is open and again (uncapped) once it has ended, as a rewatch.
   * A learner who already has a seat can add a module until it starts.
   */
  private async resolveCohortSeat(
    seatCohortId: string | null,
    dto: PurchaseCourseDto,
    now: Date,
  ) {
    if (seatCohortId && dto.cohortId && dto.cohortId !== seatCohortId) {
      throw new ConflictException(
        'You already have a seat in another cohort of this program. Contact support to switch.',
      );
    }
    const cohortId = seatCohortId ?? dto.cohortId;
    if (!cohortId) {
      throw new BadRequestException('Pick a cohort to join.');
    }
    const cohort = await this.prisma.cohort.findFirst({
      where: {
        id: cohortId,
        courseId: dto.courseId,
        status: CohortStatus.APPROVED,
      },
      include: { modules: { select: { moduleId: true, startsAt: true } } },
    });
    if (!cohort) {
      throw new BadRequestException('That cohort is not open for enrollment.');
    }

    const phase = cohortSalesPhase(cohort, now);
    const isNew = !seatCohortId;
    if (phase === 'CLOSED') {
      if (isNew) {
        throw new BadRequestException(
          `Enrollment for ${cohort.name} has closed. It reopens as a rewatch on ${formatDateOnly(cohort.endsAt)}.`,
        );
      }
      const moduleStart = cohort.modules.find(
        (entry) => entry.moduleId === dto.moduleId,
      )?.startsAt;
      if (
        dto.type === EnrollmentType.MODULAR &&
        moduleStart &&
        moduleStart <= now
      ) {
        throw new BadRequestException(
          'This module has already started for your cohort. You can buy it once the cohort ends.',
        );
      }
    }
    return { cohortId, phase, isNew, seatCap: cohort.seatCap };
  }

  private async assertSeatAvailable(
    db: Pick<PrismaService, 'enrollment'>,
    cohortId: string,
    seatCap: number,
  ): Promise<void> {
    const taken = await db.enrollment.count({
      where: { cohortId, status: { in: ENROLLMENT_ACCESS_STATUSES } },
    });
    if (taken >= seatCap) {
      throw new ConflictException('This cohort is full.');
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
            cohortId: enr.cohortId,
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
