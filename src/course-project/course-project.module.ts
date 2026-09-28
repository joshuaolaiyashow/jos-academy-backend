import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAccessModule } from '../course-access/course-access.module';
import { NotificationModule } from '../notification/notification.module';
import { MediaModule } from '../media/media.module';
import { CourseProjectService } from './course-project.service';
import { CourseProjectController } from './course-project.controller';

@Module({
  imports: [PrismaModule, CourseAccessModule, NotificationModule, MediaModule],
  providers: [CourseProjectService],
  controllers: [CourseProjectController],
  exports: [CourseProjectService],
})
export class CourseProjectModule {}
