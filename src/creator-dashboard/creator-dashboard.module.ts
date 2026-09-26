import { Module } from '@nestjs/common';
import { CreatorDashboardService } from './creator-dashboard.service';
import { CreatorDashboardController } from './creator-dashboard.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LiveSessionModule } from '../live-session/live-session.module';
import { NotificationModule } from '../notification/notification.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { CourseProjectModule } from '../course-project/course-project.module';
import { CreatorEarningsService } from './creator-earnings.service';

@Module({
  imports: [
    PrismaModule,
    LiveSessionModule,
    NotificationModule,
    AssignmentModule,
    CourseProjectModule,
  ],
  providers: [CreatorDashboardService, CreatorEarningsService],
  controllers: [CreatorDashboardController],
})
export class CreatorDashboardModule {}
