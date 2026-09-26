import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { DiscountModule } from '../discount/discount.module';
import { BadgesModule } from '../badges/badges.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    DiscountModule,
    BadgesModule,
    ReferralModule,
  ],
  providers: [EnrollmentService],
  controllers: [EnrollmentController],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
