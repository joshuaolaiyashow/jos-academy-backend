import { Module } from '@nestjs/common';
import { LessonService } from './lesson.service';
import { LessonController } from './lesson.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { BadgesModule } from '../badges/badges.module';
import { CertificateModule } from '../certificate/certificate.module';
import { CourseAccessModule } from '../course-access/course-access.module';

@Module({
  imports: [
    PrismaModule,
    EnrollmentModule,
    BadgesModule,
    CertificateModule,
    CourseAccessModule,
  ],
  providers: [LessonService],
  controllers: [LessonController],
  exports: [LessonService],
})
export class LessonModule {}
