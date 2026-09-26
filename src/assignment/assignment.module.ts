import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAccessModule } from '../course-access/course-access.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { NotificationModule } from '../notification/notification.module';
import { AssignmentAuthoringService } from './assignment-authoring.service';
import { AssignmentSubmissionService } from './assignment-submission.service';
import { AssignmentController } from './assignment.controller';
import { AssignmentGradingController } from './assignment-grading.controller';

@Module({
  imports: [
    PrismaModule,
    CourseAccessModule,
    FileUploadModule,
    NotificationModule,
  ],
  providers: [AssignmentAuthoringService, AssignmentSubmissionService],
  controllers: [AssignmentController, AssignmentGradingController],
  exports: [AssignmentAuthoringService],
})
export class AssignmentModule {}
