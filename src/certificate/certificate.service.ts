import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { EnrollmentStatus } from '../generated/prisma/client';
import { hasEnrollmentAccess } from '../enrollment/enrollment-access';
import { generateReferralCode, isUniqueViolation } from '../utils';
import { NOTIFICATION_LINKS } from '../notification/notification-links';

const SERIAL_PREFIX = 'JOSA';
const SERIAL_LENGTH = 8;
const SERIAL_ATTEMPTS = 3;
const CERTIFICATE_NOTIFICATION_TYPE = 'certificate-issued';

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Called after every lesson completion. Once the learner has completed every
   * lesson in the course, marks the enrollment COMPLETED and issues exactly one
   * certificate — safe to call repeatedly and concurrently.
   */
  async evaluateCourseCompletion(userId: string, courseId: string) {
    const [lessonCount, completedCount, enrollment] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lesson.count({
        where: {
          module: { courseId },
          progress: { some: { userId, completed: true } },
        },
      }),
      this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        include: {
          user: { select: { name: true } },
          course: { select: { name: true } },
        },
      }),
    ]);

    if (lessonCount === 0 || completedCount < lessonCount) return;
    if (!enrollment || !hasEnrollmentAccess(enrollment.status)) return;

    if (enrollment.status !== EnrollmentStatus.COMPLETED) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.COMPLETED },
      });
    }

    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) return;

    const certificate = await this.createCertificate(
      userId,
      courseId,
      enrollment.user.name,
      enrollment.course.name,
    );
    if (!certificate) return;

    this.logger.log(
      `🎓 Certificate ${certificate.serial} issued to user ${userId} for course ${courseId}`,
    );
    await this.notificationService.createNotification(
      userId,
      'Certificate earned',
      `You completed "${enrollment.course.name}". Your certificate is ready on your profile.`,
      CERTIFICATE_NOTIFICATION_TYPE,
      NOTIFICATION_LINKS.certificate(certificate.id),
    );
  }

  /**
   * Retries on a serial collision; returns null when a concurrent completion
   * already issued this learner's certificate for the course.
   */
  private async createCertificate(
    userId: string,
    courseId: string,
    recipientName: string,
    courseName: string,
  ) {
    for (let attempt = 1; attempt <= SERIAL_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.certificate.create({
          data: {
            userId,
            courseId,
            recipientName,
            courseName,
            serial: generateReferralCode(SERIAL_LENGTH, SERIAL_PREFIX),
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const alreadyIssued = await this.prisma.certificate.findUnique({
          where: { userId_courseId: { userId, courseId } },
        });
        if (alreadyIssued) return null;
      }
    }
    throw new Error('Could not generate a unique certificate serial');
  }

  async getMyCertificates(userId: string) {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        serial: true,
        courseId: true,
        courseName: true,
        issuedAt: true,
      },
    });
    return { certificates };
  }

  /**
   * Public verification view — anyone holding the link can confirm the
   * certificate is genuine. Exposes only what is printed on the certificate.
   */
  async getCertificate(id: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            duration: true,
            durationType: true,
            creator: { select: { name: true } },
          },
        },
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return {
      id: certificate.id,
      serial: certificate.serial,
      recipientName: certificate.recipientName,
      courseName: certificate.courseName,
      durationLabel: `${certificate.course.duration} ${capitalize(certificate.course.durationType)}`,
      instructorName: certificate.course.creator?.name ?? null,
      issuedAt: certificate.issuedAt,
    };
  }
}
