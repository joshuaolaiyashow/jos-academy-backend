import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { InitiateEnrollmentDto } from './dto/initiate-enrollment.dto';
import {
  EnrollmentStatus,
  EnrollmentType,
  PaymentStatus,
  PaymentType,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Initiate Course Enrollment (Full Course or Pay-Per-Module)
   * Calculates pricing and returns Paystack authorization URL
   */
  async initiateEnrollment(userId: string, dto: InitiateEnrollmentDto) {
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
        modules: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID "${courseId}" not found`);
    }

    // 3. Check existing enrollment
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
        'You already have an active Full Course enrollment for this course.',
      );
    }

    let amount: number;
    let paymentType: PaymentType;
    let targetModuleId: string | null = null;

    if (type === EnrollmentType.FULL_COURSE) {
      amount = course.tuitionFee;
      paymentType = PaymentType.FULL_COURSE;
    } else if (type === EnrollmentType.MODULAR) {
      if (!moduleId) {
        throw new BadRequestException(
          'moduleId is required when enrollment type is MODULAR.',
        );
      }

      // Verify module belongs to this course
      const targetModule = course.modules.find((m) => m.id === moduleId);
      if (!targetModule) {
        throw new BadRequestException(
          `Module with ID "${moduleId}" does not belong to this course.`,
        );
      }

      // Check if user already unlocked this module
      if (existingEnrollment) {
        const alreadyUnlocked = existingEnrollment.enrolledModules.some(
          (em) => em.moduleId === moduleId,
        );
        if (alreadyUnlocked) {
          throw new ConflictException(
            'You have already purchased access to this module.',
          );
        }
      }

      const totalModules = course.modules.length;
      if (totalModules === 0) {
        throw new BadRequestException(
          'This course has no modules configured yet.',
        );
      }

      // Price per module = Course Tuition divided by total modules count
      amount = Math.round(course.tuitionFee / totalModules);
      paymentType = PaymentType.MODULE;
      targetModuleId = moduleId;
    } else {
      throw new BadRequestException('Invalid enrollment type');
    }

    // 4. Create or reuse Enrollment record
    let enrollment = existingEnrollment;
    if (!enrollment) {
      enrollment = await this.prisma.enrollment.create({
        data: {
          userId,
          courseId,
          type,
          status: EnrollmentStatus.PENDING,
        },
        include: {
          enrolledModules: true,
        },
      });
    }

    // 5. Generate unique Paystack reference
    const reference = `JOS-ENR-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;

    // 6. Record Pending Payment in database
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        courseId,
        moduleId: targetModuleId,
        enrollmentId: enrollment.id,
        amount,
        reference,
        status: PaymentStatus.PENDING,
        type: paymentType,
      },
    });

    // 7. Initialize transaction with Paystack
    const paystackData = await this.paymentService.initializePayment({
      email: user.email,
      amount,
      reference,
      metadata: {
        userId,
        courseId,
        moduleId: targetModuleId,
        enrollmentId: enrollment.id,
        paymentId: payment.id,
        enrollmentType: type,
        courseName: course.name,
      },
    });

    this.logger.log(
      `🛒 Enrollment initiated for ${user.email}: Course "${course.name}", Type: ${type}, Amount: ₦${amount}, Ref: ${reference}`,
    );

    return {
      message: 'Enrollment initiated successfully. Please complete payment.',
      authorizationUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      reference,
      amount,
      courseId: course.id,
      courseName: course.name,
      enrollmentType: type,
      moduleId: targetModuleId,
    };
  }

  /**
   * Verify Paystack payment and activate course/module access
   * @param reference Paystack transaction reference
   */
  async verifyEnrollment(reference: string) {
    // 1. Fetch payment record
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: {
        user: true,
        course: {
          include: {
            modules: true,
          },
        },
        enrollment: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `Payment record with reference "${reference}" not found.`,
      );
    }

    if (payment.status === PaymentStatus.SUCCESSFUL) {
      return {
        message: 'Payment has already been verified and activated.',
        status: payment.status,
        payment,
      };
    }

    // 2. Verify with Paystack API
    const verifyData = await this.paymentService.verifyPayment(reference);

    if (verifyData.status !== 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException(
        `Payment was not successful. Status: ${verifyData.status}`,
      );
    }

    // 3. Activate Enrollment and unlock module(s) in a database transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Mark payment as successful
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: verifyData.paid_at ? new Date(verifyData.paid_at) : new Date(),
        },
      });

      const enrollmentId = payment.enrollmentId!;

      if (payment.type === PaymentType.FULL_COURSE) {
        // Activate full course enrollment
        const updatedEnrollment = await tx.enrollment.update({
          where: { id: enrollmentId },
          data: {
            status: EnrollmentStatus.ACTIVE,
            type: EnrollmentType.FULL_COURSE,
          },
        });

        // Bulk unlock all modules in the course
        for (const mod of payment.course.modules) {
          await tx.enrolledModule.upsert({
            where: {
              enrollmentId_moduleId: {
                enrollmentId,
                moduleId: mod.id,
              },
            },
            create: {
              enrollmentId,
              moduleId: mod.id,
            },
            update: {},
          });
        }

        return { payment: updatedPayment, enrollment: updatedEnrollment };
      } else {
        // Modular enrollment
        const updatedEnrollment = await tx.enrollment.update({
          where: { id: enrollmentId },
          data: {
            status: EnrollmentStatus.ACTIVE,
          },
        });

        // Unlock the specific paid module
        if (payment.moduleId) {
          await tx.enrolledModule.upsert({
            where: {
              enrollmentId_moduleId: {
                enrollmentId,
                moduleId: payment.moduleId,
              },
            },
            create: {
              enrollmentId,
              moduleId: payment.moduleId,
            },
            update: {},
          });
        }

        // Check if student now owns all modules
        const unlockedCount = await tx.enrolledModule.count({
          where: { enrollmentId },
        });

        if (unlockedCount >= payment.course.modules.length && payment.course.modules.length > 0) {
          await tx.enrollment.update({
            where: { id: enrollmentId },
            data: { type: EnrollmentType.FULL_COURSE },
          });
        }

        return { payment: updatedPayment, enrollment: updatedEnrollment };
      }
    });

    this.logger.log(
      `🎉 Payment confirmed & Enrollment activated: User ${payment.user.email}, Course "${payment.course.name}", Ref: ${reference}`,
    );

    return {
      message: 'Payment verified successfully! Course access activated.',
      reference,
      amount: payment.amount,
      status: PaymentStatus.SUCCESSFUL,
      enrollment: result.enrollment,
    };
  }

  /**
   * Handle Paystack Webhook events (charge.success)
   */
  async handleWebhook(event: any) {
    if (event?.event === 'charge.success') {
      const reference = event.data?.reference;
      if (reference) {
        try {
          await this.verifyEnrollment(reference);
        } catch (err: any) {
          this.logger.error(
            `Webhook verification error for ${reference}:`,
            err.message,
          );
        }
      }
    }
    return { received: true };
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
