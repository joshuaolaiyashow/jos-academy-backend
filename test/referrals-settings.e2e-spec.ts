import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  PaymentStatus,
  PaymentType,
  UserRole,
} from '../src/generated/prisma/client';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedCourse,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

const PASSWORD = 'Correct-Horse-9';

type MyReferralsBody = {
  referralCode: string;
  paidCount: number;
  goal: number;
  referrals: { id: string; email: string; status: string }[];
  myReferralDiscount: { percentOff: number; isAvailable: boolean };
};

describe('Referrals, email preferences and account deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let referrer: SeededUser;
  let referrerCode: string;

  const http = () => request(app.getHttpServer());

  const tokenFor = (user: { id: string; email: string; role: UserRole }) =>
    app
      .get(JwtService)
      .signAsync(
        { sub: user.id, email: user.email, role: user.role },
        { secret: process.env.JWT_SECRET, expiresIn: '15m' },
      );

  const signUp = (email: string, referralCode?: string) =>
    http().post('/auth/sign-up').send({
      email,
      name: 'Referred Learner',
      password: PASSWORD,
      referralCode,
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    referrer = await seedUser(app, 'referrer', UserRole.USER);
    referrerCode = `JOS-E2E${Date.now().toString(36).toUpperCase()}`;
    await prisma.user.update({
      where: { id: referrer.id },
      data: { referralCode: referrerCode },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('referrals', () => {
    let refereeId: string;
    let refereeToken: string;

    it('rejects an unknown referral code without creating the account', async () => {
      const email = `ghost-${Date.now()}@e2e.test`;
      await signUp(email, 'JOS-NOPE0000').expect(400);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('links a sign-up to the referrer, case-insensitively', async () => {
      const email = `referee-${Date.now()}@e2e.test`;
      const res = await signUp(email, referrerCode.toLowerCase()).expect(201);
      refereeId = (res.body as { userId: string }).userId;

      // Unverified accounts can't call the API; verification isn't what's under test here.
      const referee = await prisma.user.update({
        where: { id: refereeId },
        data: { isEmailVerified: true },
      });
      expect(referee.referredById).toBe(referrer.id);
      refereeToken = await tokenFor(referee);
    });

    it('lists the referral as Pending with a masked email until they top up', async () => {
      const res = await http()
        .get('/referrals/me')
        .set(auth(referrer))
        .expect(200);
      const body = res.body as MyReferralsBody;

      expect(body.referralCode).toBe(referrerCode);
      expect(body.goal).toBe(10);
      expect(body.paidCount).toBe(0);
      expect(body.referrals).toHaveLength(1);
      expect(body.referrals[0]).toMatchObject({
        id: refereeId,
        status: 'PENDING',
      });
      expect(body.referrals[0].email).toMatch(/^re\*\*\*@e2e\.test$/);
    });

    it('counts the referral as Paid after a successful top-up', async () => {
      await prisma.payment.create({
        data: {
          userId: refereeId,
          amount: 1000,
          credits: 100,
          reference: `E2E-REF-${Date.now()}`,
          status: PaymentStatus.SUCCESSFUL,
          type: PaymentType.CREDIT_TOP_UP,
        },
      });

      const res = await http()
        .get('/referrals/me')
        .set(auth(referrer))
        .expect(200);
      const body = res.body as MyReferralsBody;
      expect(body.paidCount).toBe(1);
      expect(body.referrals[0].status).toBe('PAID');
    });

    it('gives the referee 5% off their first program purchase, once', async () => {
      await prisma.user.update({
        where: { id: refereeId },
        data: { credits: 5000 },
      });
      const header = { Authorization: `Bearer ${refereeToken}` };

      const before = await http().get('/referrals/me').set(header).expect(200);
      expect((before.body as MyReferralsBody).myReferralDiscount).toEqual({
        percentOff: 5,
        isAvailable: true,
      });

      // seedCourse: ₦10,000 tuition -> 1,000 credits, so 5% is 50.
      const first = await seedCourse(app, referrer.id, 1);
      const purchase = await http()
        .post('/enrollments/purchase')
        .set(header)
        .send({ courseId: first.id, type: 'FULL_COURSE' })
        .expect(201);
      expect(purchase.body).toMatchObject({
        originalCredits: 1000,
        referralDiscountCredits: 50,
        creditsDeducted: 950,
      });

      const second = await seedCourse(app, referrer.id, 1);
      const again = await http()
        .post('/enrollments/purchase')
        .set(header)
        .send({ courseId: second.id, type: 'FULL_COURSE' })
        .expect(201);
      expect(again.body).toMatchObject({
        referralDiscountCredits: 0,
        creditsDeducted: 1000,
      });

      const after = await http().get('/referrals/me').set(header).expect(200);
      expect(
        (after.body as MyReferralsBody).myReferralDiscount.isAvailable,
      ).toBe(false);
    });
  });

  describe('email preferences', () => {
    it('defaults to every email on and saves a change', async () => {
      const learner = await seedUser(app, 'prefs', UserRole.USER);

      await http()
        .get('/profile/notification-preferences')
        .set(auth(learner))
        .expect(200)
        .expect({ emailAssignmentGraded: true, emailLiveSessions: true });

      await http()
        .patch('/profile/notification-preferences')
        .set(auth(learner))
        .send({ emailLiveSessions: false })
        .expect(200)
        .expect({ emailAssignmentGraded: true, emailLiveSessions: false });
    });

    it('skips opted-out learners when a live session is scheduled', async () => {
      const creator = await seedUser(
        app,
        'session-creator',
        UserRole.INSTRUCTOR,
      );
      const optedIn = await seedUser(app, 'session-in', UserRole.USER);
      const optedOut = await seedUser(app, 'session-out', UserRole.USER);
      const course = await seedCourse(app, creator.id, 1);
      await prisma.enrollment.createMany({
        data: [optedIn, optedOut].map((learner) => ({
          userId: learner.id,
          courseId: course.id,
          type: 'FULL_COURSE' as const,
          status: 'ACTIVE' as const,
        })),
      });
      await prisma.notificationPreference.create({
        data: { userId: optedOut.id, emailLiveSessions: false },
      });

      const sendEmail = jest.spyOn(app.get(NotificationService), 'sendEmail');
      sendEmail.mockClear();

      await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Kickoff',
          type: 'Lecture',
          platform: 'Zoom',
          meetingLink: 'https://zoom.us/j/1',
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
          durationMins: 60,
          courseId: course.id,
        })
        .expect(201);

      const recipients = sendEmail.mock.calls.map(([options]) => options.to);
      expect(recipients).toContain(optedIn.email);
      expect(recipients).not.toContain(optedOut.email);
    });
  });

  describe('delete account', () => {
    it('refuses a mismatched confirmation and non-student accounts', async () => {
      const learner = await seedUser(app, 'delete-mismatch', UserRole.USER);
      await http()
        .delete('/profile')
        .set(auth(learner))
        .send({ confirmEmail: 'someone-else@e2e.test' })
        .expect(400);

      const creator = await seedUser(
        app,
        'delete-creator',
        UserRole.INSTRUCTOR,
      );
      await http()
        .delete('/profile')
        .set(auth(creator))
        .send({ confirmEmail: creator.email })
        .expect(403);
    });

    it('anonymises the account, keeps its payments, and blocks sign-in', async () => {
      const learner = await seedUser(app, 'delete-me', UserRole.USER);
      await prisma.payment.create({
        data: {
          userId: learner.id,
          amount: 500,
          reference: `E2E-DEL-${Date.now()}`,
          status: PaymentStatus.SUCCESSFUL,
          type: PaymentType.CREDIT_TOP_UP,
        },
      });

      await http()
        .delete('/profile')
        .set(auth(learner))
        .send({ confirmEmail: learner.email.toUpperCase() })
        .expect(200);

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: learner.id },
      });
      expect(row).toMatchObject({
        name: 'Deleted user',
        isSuspended: true,
        avatarUrl: null,
        referralCode: null,
      });
      expect(row.email).not.toBe(learner.email);
      expect(
        await prisma.payment.count({ where: { userId: learner.id } }),
      ).toBe(1);

      await http()
        .post('/auth/sign-in')
        .send({ email: learner.email, password: PASSWORD })
        .expect(401);
    });
  });
});
