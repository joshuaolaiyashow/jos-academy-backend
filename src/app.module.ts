import { ScheduleModule } from '@nestjs/schedule';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { CourseModule } from './course/course.module';
import { CourseModuleModule } from './course-module/course-module.module';
import { CreatorModule } from './creator/creator.module';
import { FileUploadModule } from './file-upload/file-upload.module';
import { CategoryModule } from './category/category.module';
import { PaymentModule } from './payment/payment.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { CreditModule } from './credit/credit.module';
import { DiscountModule } from './discount/discount.module';
import { ReferralModule } from './referral/referral.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LessonModule } from './lesson/lesson.module';
import { LiveSessionModule } from './live-session/live-session.module';
import { ProfileModule } from './profile/profile.module';
import { ExploreModule } from './explore/explore.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CreatorDashboardModule } from './creator-dashboard/creator-dashboard.module';
import { MediaModule } from './media/media.module';
import { BadgesModule } from './badges/badges.module';
import { AdminModule } from './admin/admin.module';
import { ReviewModule } from './review/review.module';
import { CertificateModule } from './certificate/certificate.module';
import { LessonNoteModule } from './lesson-note/lesson-note.module';
import { DiscussionModule } from './discussion/discussion.module';
import { AssignmentModule } from './assignment/assignment.module';
import { CourseProjectModule } from './course-project/course-project.module';
import { AuditModule } from './audit/audit.module';
import { auditContextMiddleware } from './audit/audit-context';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Global rate limit; auth.controller.ts tightens the window further on
    // sign-in/sign-up/password-reset via the @Throttle decorator.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      // Only the e2e setup sets this: the suite signs in far more often than a real client.
      skipIf: () => process.env.E2E_DISABLE_RATE_LIMIT === 'true',
    }),
    PrismaModule,
    AuthModule,
    NotificationModule,
    CourseModule,
    CourseModuleModule,
    CreatorModule,
    FileUploadModule,
    CategoryModule,
    PaymentModule,
    EnrollmentModule,
    CreditModule,
    DiscountModule,
    ReferralModule,
    OnboardingModule,
    LessonModule,
    LiveSessionModule,
    ProfileModule,
    ExploreModule,
    DashboardModule,
    CreatorDashboardModule,
    MediaModule,
    BadgesModule,
    AdminModule,
    ReviewModule,
    CertificateModule,
    LessonNoteModule,
    DiscussionModule,
    AssignmentModule,
    CourseProjectModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(auditContextMiddleware).forRoutes('*');
  }
}
