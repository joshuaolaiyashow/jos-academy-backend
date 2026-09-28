import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  DiscountAppliesTo,
  PaymentType,
  UserRole,
} from '../src/generated/prisma/client';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

const fakePaystack: Pick<
  PaymentService,
  'initializePayment' | 'verifyPayment'
> = {
  initializePayment: async ({ reference }) =>
    ({
      authorization_url: `https://paystack.test/${reference}`,
      access_code: 'access-code',
      reference: reference ?? 'unknown',
    }) as Awaited<ReturnType<PaymentService['initializePayment']>>,
  verifyPayment: async (reference) =>
    ({
      status: 'success',
      reference,
      amount: 0,
      paid_at: new Date().toISOString(),
    }) as Awaited<ReturnType<PaymentService['verifyPayment']>>,
};

describe('Self-registration role lock and discount/referral double-spend guards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp([{ token: PaymentService, value: fakePaystack }]);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/sign-up', () => {
    it('refuses a self-registered ADMIN role', async () => {
      const response = await http()
        .post('/auth/sign-up')
        .send({
          email: `admin-attempt-${Date.now()}@e2e.test`,
          name: 'Wannabe Admin',
          password: 'password123',
          role: UserRole.ADMIN,
        })
        .expect(400);
      expect(JSON.stringify(response.body)).toContain(
        'Role must be USER or INSTRUCTOR',
      );
    });

    it('still allows USER and INSTRUCTOR', async () => {
      await http()
        .post('/auth/sign-up')
        .send({
          email: `instructor-signup-${Date.now()}@e2e.test`,
          name: 'Real Instructor',
          password: 'password123',
          role: UserRole.INSTRUCTOR,
        })
        .expect(201);
    });
  });

  describe('discount code per-user limit under racing checkouts', () => {
    let buyer: SeededUser;
    let code: string;

    beforeAll(async () => {
      buyer = await seedUser(app, 'discount-racer', UserRole.USER);
      code = `RACE${Date.now()}`;
      await prisma.discountCampaign.create({
        data: {
          name: 'Race campaign',
          code,
          percentOff: 50,
          appliesTo: DiscountAppliesTo.CREDIT_TOP_UP,
          startsAt: new Date(Date.now() - 1000),
          endsAt: new Date(Date.now() + 60_000),
          maxRedemptions: null,
          perUserLimit: 1,
        },
      });
    });

    it('lets only one of two simultaneous checkouts hold the discount', async () => {
      const [first, second] = await Promise.all([
        http()
          .post('/credits/buy')
          .set(auth(buyer))
          .send({ credits: 1000, discountCode: code }),
        http()
          .post('/credits/buy')
          .set(auth(buyer))
          .send({ credits: 1000, discountCode: code }),
      ]);

      const statuses = [first.status, second.status].sort();
      // One checkout gets the discount; the other is refused for having already used the code.
      expect(statuses).toEqual([201, 409]);

      const discountedPayments = await prisma.payment.count({
        where: {
          userId: buyer.id,
          type: PaymentType.CREDIT_TOP_UP,
          discountAmount: { not: null },
        },
      });
      expect(discountedPayments).toBe(1);
    });

    it('still refuses the code once the winning checkout actually redeems it', async () => {
      const winningPayment = await prisma.payment.findFirstOrThrow({
        where: { userId: buyer.id, type: PaymentType.CREDIT_TOP_UP },
      });
      await http()
        .get(`/credits/verify/${winningPayment.reference}`)
        .set(auth(buyer))
        .expect(200);
      const redemption = await prisma.discountRedemption.findFirst({
        where: { userId: buyer.id },
      });
      expect(redemption).not.toBeNull();

      // perUserLimit(1) is now spent by a real redemption, not just a pending checkout.
      await http()
        .post('/credits/buy')
        .set(auth(buyer))
        .send({ credits: 1000, discountCode: code })
        .expect(409);
    });
  });

  describe('referral discount under racing checkouts', () => {
    it('lets only one of two simultaneous checkouts hold the referral discount', async () => {
      const referrer = await seedUser(app, 'referrer', UserRole.USER);
      const referee = await seedUser(app, 'referee', UserRole.USER);
      await prisma.user.update({
        where: { id: referee.id },
        data: { referredById: referrer.id },
      });

      const [first, second] = await Promise.all([
        http()
          .post('/credits/buy')
          .set(auth(referee))
          .send({ credits: 1000 })
          .expect(201),
        http()
          .post('/credits/buy')
          .set(auth(referee))
          .send({ credits: 1000 })
          .expect(201),
      ]);

      const discountedAmounts = [first, second]
        .map((response) => response.body.referralDiscountAmountInNaira)
        .sort((a: number, b: number) => a - b);
      // Both requests succeed (a top-up never needs a code), but only one carries the referral discount.
      expect(discountedAmounts).toEqual([0, expect.any(Number)]);
      expect(discountedAmounts[1]).toBeGreaterThan(0);
    });
  });

  describe('resolveDiscount', () => {
    it('still rejects an unknown or expired code the same way', async () => {
      await http()
        .post('/credits/buy')
        .set(auth(await seedUser(app, 'unknown-code', UserRole.USER)))
        .send({ credits: 1000, discountCode: 'NOT-A-REAL-CODE' })
        .expect(400);
    });
  });
});
