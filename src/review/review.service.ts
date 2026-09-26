import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentStatus } from '../generated/prisma/client';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates or updates the student's review for a course. Only allowed once
   * their enrollment for that course is COMPLETED — matches the product
   * decision that reviews are collected after finishing the course, not
   * mid-way through.
   */
  async upsertReview(
    userId: string,
    courseId: string,
    rating: number,
    comment?: string,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (!enrollment || enrollment.status !== EnrollmentStatus.COMPLETED) {
      throw new ForbiddenException(
        'You can only review a course after completing it',
      );
    }

    const review = await this.prisma.review.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, rating, comment },
      update: { rating, comment },
    });

    this.logger.log(
      `⭐ Review upserted for course ${courseId} by user ${userId}`,
    );

    return review;
  }

  /**
   * A course's reviews with the average rating and count. Public — shown on
   * the course/program page and used to aggregate a creator's overall rating.
   */
  async getCourseReviews(courseId: string) {
    const [reviews, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where: { courseId },
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.aggregate({
        where: { courseId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      total: aggregate._count,
      averageRating: aggregate._avg.rating ?? 0,
      reviews,
    };
  }

  /** The logged-in student's own review for a course, or null if they haven't left one. */
  async getMyReviewForCourse(userId: string, courseId: string) {
    return this.prisma.review.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
  }
}
