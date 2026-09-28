import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, PaymentType, Prisma } from '../generated/prisma/client';
import {
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_GOAL,
  REFERRAL_STATUS,
} from './referral.constants';

type DbClient = PrismaService | Prisma.TransactionClient;

/** "faridawaziri44@gmail.com" -> "fa***@gmail.com": enough to recognise a friend, not to harvest. */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /** The referrer's id for a sign-up code; an unknown code is a 400 so the user can fix a typo. */
  async findReferrerId(rawCode: string | undefined): Promise<string | null> {
    const code = rawCode?.trim().toUpperCase();
    if (!code) return null;
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!referrer) {
      throw new BadRequestException('That referral code does not exist.');
    }
    return referrer.id;
  }

  /**
   * Naira/credits off `amount` if this user still has their referee discount.
   * Only a preview — the purchase must `claimDiscount` for it to stick.
   */
  async discountFor(
    userId: string,
    amount: number,
    client: DbClient = this.prisma,
  ): Promise<number> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { referredById: true, referralDiscountUsedAt: true },
    });
    if (!user?.referredById || user.referralDiscountUsedAt) return 0;
    // The discount is only marked used once a top-up is paid, so without this a
    // buyer could open several discounted checkouts before any of them settled.
    const pendingClaim = await client.payment.count({
      where: {
        userId,
        status: PaymentStatus.PENDING,
        referralDiscountAmount: { not: null },
      },
    });
    if (pendingClaim > 0) return 0;
    return Math.floor((amount * REFERRAL_DISCOUNT_PERCENT) / 100);
  }

  /** Marks the discount spent; false if it was already spent (e.g. a concurrent purchase won). */
  async claimDiscount(client: DbClient, userId: string): Promise<boolean> {
    const { count } = await client.user.updateMany({
      where: {
        id: userId,
        referredById: { not: null },
        referralDiscountUsedAt: null,
      },
      data: { referralDiscountUsedAt: new Date() },
    });
    return count === 1;
  }

  /** A referral is Paid once the invited user completes a credit top-up. */
  async getMine(userId: string) {
    const [me, referrals] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          referralCode: true,
          referredById: true,
          referralDiscountUsedAt: true,
        },
      }),
      this.prisma.user.findMany({
        where: { referredById: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          payments: {
            where: {
              type: PaymentType.CREDIT_TOP_UP,
              status: PaymentStatus.SUCCESSFUL,
            },
            select: { id: true },
            take: 1,
          },
        },
      }),
    ]);

    const rows = referrals.map((referral) => ({
      id: referral.id,
      name: referral.name,
      email: maskEmail(referral.email),
      joinedAt: referral.createdAt,
      status:
        referral.payments.length > 0
          ? REFERRAL_STATUS.PAID
          : REFERRAL_STATUS.PENDING,
    }));

    return {
      referralCode: me.referralCode,
      discountPercent: REFERRAL_DISCOUNT_PERCENT,
      goal: REFERRAL_GOAL,
      paidCount: rows.filter((row) => row.status === REFERRAL_STATUS.PAID)
        .length,
      referrals: rows,
      myReferralDiscount: {
        percentOff: REFERRAL_DISCOUNT_PERCENT,
        isAvailable: Boolean(me.referredById && !me.referralDiscountUsedAt),
      },
    };
  }
}
