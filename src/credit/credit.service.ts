import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { BuyCreditsDto } from './dto/buy-credits.dto';
import { DiscountService } from '../discount/discount.service';
import { BadgesService } from '../badges/badges.service';
import { ReferralService } from '../referral/referral.service';
import {
  CreditTransactionType,
  DiscountTarget,
  PaymentStatus,
  PaymentType,
  UserRole,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';

// Conversion rate constant: 10 credits = 100 Naira (1 credit = 10 Naira)
export const NAIRA_PER_CREDIT = 10;

// Program pricing: tuition is set in USD and converted at 100 credits = $10.
export const CREDITS_PER_USD = 10;

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly discountService: DiscountService,
    private readonly badgesService: BadgesService,
    private readonly referrals: ReferralService,
  ) {}

  /**
   * Initiate Credit Purchase via Paystack
   * 10 Credits = ₦100 (1 Credit = ₦10)
   */
  async buyCredits(userId: string, dto: BuyCreditsDto) {
    const { credits, discountCode } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const fullPriceInNaira = credits * NAIRA_PER_CREDIT;
    const discount = discountCode
      ? await this.discountService.resolveDiscount(
          userId,
          discountCode,
          DiscountTarget.CREDIT_TOP_UP,
          fullPriceInNaira,
        )
      : null;
    // The referee discount never stacks with a code; it waits for a purchase without one.
    const referralDiscount = discount
      ? 0
      : await this.referrals.discountFor(userId, fullPriceInNaira);
    const amountInNaira = discount
      ? discount.finalAmount
      : fullPriceInNaira - referralDiscount;
    const reference = `JOS-CRD-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;

    // Record pending payment in database
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: amountInNaira,
        credits,
        reference,
        status: PaymentStatus.PENDING,
        type: PaymentType.CREDIT_TOP_UP,
        discountCampaignId: discount?.campaignId,
        discountAmount: discount?.discountAmount,
        referralDiscountAmount: referralDiscount || null,
      },
    });

    // Initialize Paystack checkout
    const paystackData = await this.paymentService.initializePayment({
      email: user.email,
      amount: amountInNaira,
      reference,
      metadata: {
        userId,
        paymentId: payment.id,
        type: 'CREDIT_TOP_UP',
        credits,
        amountInNaira,
      },
    });

    this.logger.log(
      `💳 Credit top-up initiated for ${user.email}: ${credits} credits (₦${amountInNaira}), Ref: ${reference}`,
    );

    return {
      message: 'Credit purchase initiated. Please complete payment.',
      authorizationUrl: paystackData.authorization_url,
      accessCode: paystackData.access_code,
      reference,
      credits,
      amountInNaira,
      originalAmountInNaira: fullPriceInNaira,
      discountAmountInNaira: discount?.discountAmount ?? 0,
      referralDiscountAmountInNaira: referralDiscount,
      rate: `1 Credit = ₦${NAIRA_PER_CREDIT}`,
    };
  }

  /** A signed-in buyer checking their own top-up (e.g. after Paystack redirects back). */
  async verifyOwnCreditPayment(
    requester: { id: string; role: UserRole },
    reference: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      select: { userId: true },
    });
    if (
      !payment ||
      (payment.userId !== requester.id && requester.role !== UserRole.ADMIN)
    ) {
      throw new NotFoundException(
        `Payment record with reference "${reference}" not found.`,
      );
    }
    return this.verifyCreditPayment(reference);
  }

  /**
   * Verify Top-Up payment and credit user's wallet
   */
  async verifyCreditPayment(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { user: true },
    });

    if (!payment) {
      throw new NotFoundException(
        `Payment record with reference "${reference}" not found.`,
      );
    }

    if (payment.status === PaymentStatus.SUCCESSFUL) {
      return {
        message: 'Payment has already been processed.',
        status: payment.status,
        credits: payment.credits,
      };
    }

    // Verify with Paystack API
    const verifyData = await this.paymentService.verifyPayment(reference);

    if (verifyData.status !== 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException(
        `Payment was not successful. Status: ${verifyData.status}`,
      );
    }

    const creditsToAdd =
      payment.credits || Math.floor(payment.amount / NAIRA_PER_CREDIT);

    // Atomically increment user credits and record transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark payment as successful. The status guard makes the webhook and a manual
      // verify racing each other safe: only one of them can flip it, so credits land once.
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.SUCCESSFUL } },
        data: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: verifyData.paid_at
            ? new Date(verifyData.paid_at)
            : new Date(),
        },
      });
      if (count === 0) return null;
      const updatedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      // 2. Increment user credit balance
      const updatedUser = await tx.user.update({
        where: { id: payment.userId },
        data: {
          credits: { increment: creditsToAdd },
        },
      });

      // 3. Record the discount use, if this top-up was discounted
      if (payment.discountCampaignId && payment.discountAmount) {
        await this.discountService.recordRedemption(tx, {
          campaignId: payment.discountCampaignId,
          userId: payment.userId,
          target: DiscountTarget.CREDIT_TOP_UP,
          originalAmount: payment.amount + payment.discountAmount,
          discountAmount: payment.discountAmount,
          finalAmount: payment.amount,
          reference,
        });
      }

      // The buyer already paid the reduced price, so this only closes the offer for later purchases.
      if (payment.referralDiscountAmount) {
        await this.referrals.claimDiscount(tx, payment.userId);
      }

      // 4. Log credit transaction
      const creditTx = await tx.creditTransaction.create({
        data: {
          userId: payment.userId,
          amount: creditsToAdd,
          balanceAfter: updatedUser.credits,
          type: CreditTransactionType.TOP_UP,
          description: `Wallet top-up of ${creditsToAdd} credits via Paystack (₦${payment.amount})`,
          reference,
        },
      });

      return {
        payment: updatedPayment,
        user: updatedUser,
        creditTransaction: creditTx,
      };
    });
    if (!result) {
      return {
        message: 'Payment has already been processed.',
        status: PaymentStatus.SUCCESSFUL,
        credits: creditsToAdd,
      };
    }

    this.logger.log(
      `🎉 Wallet credited: User ${payment.user.email} received ${creditsToAdd} credits. New balance: ${result.user.credits}`,
    );

    await this.badgesService.evaluateCreditPurchase(payment.userId);

    return {
      message: 'Credits added to wallet successfully!',
      creditsAdded: creditsToAdd,
      currentBalance: result.user.credits,
      nairaEquivalent: result.user.credits * NAIRA_PER_CREDIT,
      reference,
    };
  }

  /**
   * Handle Paystack Webhook for Credit Top-Ups
   */
  async handleWebhook(event: any) {
    if (event?.event === 'charge.success') {
      const reference = event.data?.reference;
      if (reference) {
        try {
          await this.verifyCreditPayment(reference);
        } catch (err: any) {
          this.logger.error(
            `Webhook credit processing error for ${reference}: ${err.message}`,
          );
        }
      }
    }
    return { received: true };
  }

  /**
   * Get user's current credit balance
   */
  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      credits: user.credits,
      nairaEquivalent: user.credits * NAIRA_PER_CREDIT,
      conversionRate: `1 Credit = ₦${NAIRA_PER_CREDIT} (10 Credits = ₦100)`,
    };
  }

  /**
   * Get student's credit transaction history
   */
  async getTransactions(userId: string) {
    const transactions = await this.prisma.creditTransaction.findMany({
      where: { userId },
      include: {
        course: {
          select: { id: true, name: true, heroImageName: true },
        },
        module: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      total: transactions.length,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        type: tx.type,
        description: tx.description,
        reference: tx.reference,
        course: tx.course,
        module: tx.module,
        createdAt: tx.createdAt,
      })),
    };
  }
}
