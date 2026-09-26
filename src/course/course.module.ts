import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { NotificationModule } from '../notification/notification.module';
import { CourseAccessModule } from '../course-access/course-access.module';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    PrismaModule,
    FileUploadModule,
    NotificationModule,
    CourseAccessModule,
  ],
  providers: [CourseService],
  controllers: [CourseController],
  exports: [CourseService],
})
export class CourseModule {}
