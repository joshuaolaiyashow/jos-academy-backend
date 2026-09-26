import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditTransactionType } from '../generated/prisma/client';
import { NAIRA_PER_CREDIT } from '../credit/credit.service';

const REVENUE_TRANSACTION_TYPES = [
  CreditTransactionType.COURSE_PURCHASE,
  CreditTransactionType.MODULE_PURCHASE,
  CreditTransactionType.REFUND,
];
const PURCHASE_TYPES: CreditTransactionType[] = [
  CreditTransactionType.COURSE_PURCHASE,
  CreditTransactionType.MODULE_PURCHASE,
];
const PERCENT = 100;

const startOfUtcMonth = (monthsAgo: number): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1),
  );
};

/**
 * Gross revenue from learners' credit spend on the creator's programs, in
 * naira. Purchases are stored as negative credit amounts and refunds as
 * positive, so revenue is simply the negated sum. No revenue share or payouts
 * are applied yet.
 */
@Injectable()
export class CreatorEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEarnings(creatorId: string) {
    const transactions = await this.prisma.creditTransaction.findMany({
      where: {
        type: { in: REVENUE_TRANSACTION_TYPES },
        course: { creatorId },
      },
      select: {
        amount: true,
        type: true,
        userId: true,
        createdAt: true,
        course: { select: { id: true, name: true } },
      },
    });

    const thisMonthStart = startOfUtcMonth(0);
    const lastMonthStart = startOfUtcMonth(1);
    const toNaira = (credits: number): number => -credits * NAIRA_PER_CREDIT;

    const byCourse = new Map<
      string,
      {
        courseId: string;
        programTitle: string;
        buyers: Set<string>;
        totalAmount: number;
        amountThisMonth: number;
      }
    >();
    let totalEarnings = 0;
    let earningsThisMonth = 0;
    let earningsLastMonth = 0;

    for (const transaction of transactions) {
      if (!transaction.course) continue;
      const naira = toNaira(transaction.amount);
      const isThisMonth = transaction.createdAt >= thisMonthStart;
      const isLastMonth =
        !isThisMonth && transaction.createdAt >= lastMonthStart;

      totalEarnings += naira;
      if (isThisMonth) earningsThisMonth += naira;
      if (isLastMonth) earningsLastMonth += naira;

      const entry = byCourse.get(transaction.course.id) ?? {
        courseId: transaction.course.id,
        programTitle: transaction.course.name,
        buyers: new Set<string>(),
        totalAmount: 0,
        amountThisMonth: 0,
      };
      entry.totalAmount += naira;
      if (isThisMonth) entry.amountThisMonth += naira;
      if (PURCHASE_TYPES.includes(transaction.type))
        entry.buyers.add(transaction.userId);
      byCourse.set(transaction.course.id, entry);
    }

    return {
      currency: 'NGN',
      totalEarnings,
      earningsThisMonth,
      earningsLastMonth,
      changePercent:
        earningsLastMonth > 0
          ? Math.round(
              ((earningsThisMonth - earningsLastMonth) / earningsLastMonth) *
                PERCENT,
            )
          : null,
      breakdown: [...byCourse.values()]
        .map(({ buyers, ...entry }) => ({
          ...entry,
          paidStudentsCount: buyers.size,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount),
    };
  }
}
