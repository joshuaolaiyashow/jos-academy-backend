import { Module } from '@nestjs/common';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
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
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
