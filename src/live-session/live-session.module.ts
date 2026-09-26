import { Module } from '@nestjs/common';
import { LiveSessionService } from './live-session.service';
import { LiveSessionController } from './live-session.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAccessModule } from '../course-access/course-access.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, CourseAccessModule, NotificationModule],
  providers: [LiveSessionService],
  controllers: [LiveSessionController],
  exports: [LiveSessionService],
})
export class LiveSessionModule {}
