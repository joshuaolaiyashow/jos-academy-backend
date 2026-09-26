import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { CreditModule } from '../credit/credit.module';

@Module({
  imports: [PrismaModule, EnrollmentModule, CreditModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
