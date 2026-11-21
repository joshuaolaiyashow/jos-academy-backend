import { Module } from '@nestjs/common';

import { AdminModule } from '../admin/admin.module';
import { AuditModule } from '../audit/audit.module';
import { DiscountModule } from '../discount/discount.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { WorkspaceManifestController } from './workspace-manifest.controller';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [AdminModule, AuditModule, DiscountModule, OnboardingModule],
  controllers: [WorkspaceManifestController, WorkspaceController],
})
export class WorkspaceModule {}
