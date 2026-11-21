import { Module } from '@nestjs/common';

import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.module';
import { DiscountModule } from '../discount/discount.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceAudiencesController } from './workspace-audiences.controller';
import { WorkspaceAudiencesService } from './workspace-audiences';
import { WorkspaceManifestController } from './workspace-manifest.controller';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [
    AdminModule,
    AuditModule,
    DiscountModule,
    OnboardingModule,
    PrismaModule,
  ],
  controllers: [
    WorkspaceManifestController,
    WorkspaceController,
    WorkspaceAudiencesController,
  ],
  providers: [WorkspaceAudiencesService],
})
export class WorkspaceModule {}
