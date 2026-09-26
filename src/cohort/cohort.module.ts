import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAccessModule } from '../course-access/course-access.module';
import { NotificationModule } from '../notification/notification.module';
import { CohortService } from './cohort.service';
import { CohortReviewService } from './cohort-review.service';
import { CohortRosterService } from './cohort-roster.service';
import { CohortController } from './cohort.controller';
import { AdminCohortController } from './admin-cohort.controller';

@Module({
  imports: [PrismaModule, CourseAccessModule, NotificationModule],
  providers: [CohortService, CohortReviewService, CohortRosterService],
  controllers: [CohortController, AdminCohortController],
})
export class CohortModule {}
