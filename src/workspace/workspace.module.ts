import { Module } from '@nestjs/common';

import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.module';
import { CategoryModule } from '../category/category.module';
import { CreatorModule } from '../creator/creator.module';
import { DiscountModule } from '../discount/discount.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceAudiencesController } from './workspace-audiences.controller';
import {
  WorkspaceAnalyticsController,
  WorkspaceFunnelPeopleController,
} from './workspace-analytics.controller';
import { WorkspaceAnalyticsService } from './workspace-analytics.service';
import { WorkspaceAudiencesService } from './workspace-audiences';
import { WorkspaceManifestController } from './workspace-manifest.controller';
import { WorkspaceRecordsController } from './workspace-records.controller';
import { WorkspaceRecordsService } from './workspace-records.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [
    AdminModule,
    AuditModule,
    CategoryModule,
    CreatorModule,
    DiscountModule,
    OnboardingModule,
    PrismaModule,
  ],
  controllers: [
    WorkspaceManifestController,
    WorkspaceController,
    WorkspaceRecordsController,
    WorkspaceAudiencesController,
    WorkspaceAnalyticsController,
    WorkspaceFunnelPeopleController,
  ],
  providers: [
    WorkspaceAudiencesService,
    WorkspaceAnalyticsService,
    WorkspaceRecordsService,
  ],
})
export class WorkspaceModule {}
