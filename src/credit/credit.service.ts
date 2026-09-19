import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { BuyCreditsDto } from './dto/buy-credits.dto';
import {
  CreditTransactionType,
  PaymentStatus,
  PaymentType,
} from '../generated/prisma/client';
import { randomBytes } from 'crypto';

// Conversion rate constant: 10 credits = 100 Naira (1 credit = 10 Naira)
export const NAIRA_PER_CREDIT = 10;

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Initiate Credit Purchase via Paystack
   * 10 Credits = ₦100 (1 Credit = ₦10)
   */
  async buyCredits(userId: string, dto: BuyCreditsDto) {
    const { credits } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amountInNaira = credits * NAIRA_PER_CREDIT;
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
      rate: `1 Credit = ₦${NAIRA_PER_CREDIT}`,
    };
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

    const creditsToAdd = payment.credits || Math.floor(payment.amount / NAIRA_PER_CREDIT);

    // Atomically increment user credits and record transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Mark payment as successful
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESSFUL,
          paidAt: verifyData.paid_at ? new Date(verifyData.paid_at) : new Date(),
        },
      });

      // 2. Increment user credit balance
      const updatedUser = await tx.user.update({
        where: { id: payment.userId },
        data: {
          credits: { increment: creditsToAdd },
        },
      });

      // 3. Log credit transaction
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

    this.logger.log(
      `🎉 Wallet credited: User ${payment.user.email} received ${creditsToAdd} credits. New balance: ${result.user.credits}`,
    );

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
