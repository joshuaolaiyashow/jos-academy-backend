import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  EnrollmentStatus,
  PaymentStatus,
  PaymentType,
  UserRole,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedCourse,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

type Stat = { value: number; previous?: number };

const BASE = '/workspace/admin/analytics';
// Windowed charts look at a week in 2020 that only this spec writes to, so other specs' rows can't move the numbers.
const WEEK = { from: '2020-03-01', to: '2020-03-08', interval: 'day' };
const day = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const zeroes = (points: Record<string, number>) =>
  ['01', '02', '03', '04', '05', '06', '07'].map((d) => ({
    date: `2020-03-${d}`,
    value: points[d] ?? 0,
  }));

describe('JOS Workspace Overview charts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let student: SeededUser;
  let before: Record<string, unknown>;
  let c1Name: string;

  const http = () => request(app.getHttpServer());
  const chart = async <T = unknown>(
    key: string,
    query: object = WEEK,
  ): Promise<T> => {
    const res = await http()
      .get(`${BASE}/${key}`)
      .query(query)
      .set(auth(admin))
      .expect(200);
    return (res.body as { data: T }).data;
  };
  const totals = async () => ({
    students: (await chart<Stat>('total-students', {})).value,
    statuses: await chart('enrolments-by-status', {}),
  });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    admin = await seedUser(app, 'analytics-admin', UserRole.ADMIN);
    student = await seedUser(app, 'analytics-student', UserRole.USER);
    before = await totals();

    const instructor = await seedUser(
      app,
      'analytics-coach',
      UserRole.INSTRUCTOR,
    );
    const [s1, s2, s3] = await Promise.all(
      ['s1', 's2', 's3'].map((label) =>
        seedUser(app, `analytics-${label}`, UserRole.USER),
      ),
    );
    await prisma.user.update({
      where: { id: s1.id },
      data: { createdAt: day('2020-03-02') },
    });
    await prisma.user.update({
      where: { id: s2.id },
      data: { createdAt: day('2020-03-03') },
    });
    await prisma.user.update({
      where: { id: s3.id },
      data: { createdAt: day('2020-02-25') },
    });

    const c1 = await seedCourse(app, instructor.id, 2);
    const c2 = await seedCourse(app, instructor.id, 1);
    c1Name = (await prisma.course.findUniqueOrThrow({ where: { id: c1.id } }))
      .name;
    const c2Name = (
      await prisma.course.findUniqueOrThrow({ where: { id: c2.id } })
    ).name;

    await prisma.enrollment.createMany({
      data: [
        {
          userId: s1.id,
          courseId: c1.id,
          status: EnrollmentStatus.ACTIVE,
          createdAt: day('2020-03-02'),
        },
        {
          userId: s2.id,
          courseId: c1.id,
          status: EnrollmentStatus.COMPLETED,
          createdAt: day('2020-03-04'),
        },
        {
          userId: s2.id,
          courseId: c2.id,
          status: EnrollmentStatus.PENDING,
          createdAt: day('2020-03-04'),
        },
        {
          userId: s3.id,
          courseId: c2.id,
          status: EnrollmentStatus.ACTIVE,
          createdAt: day('2020-02-26'),
        },
      ],
    });
    const ref = (label: string) => `analytics-${label}-${Date.now()}`;
    await prisma.payment.createMany({
      data: [
        {
          userId: s1.id,
          courseId: c1.id,
          amount: 100,
          status: PaymentStatus.SUCCESSFUL,
          paidAt: day('2020-03-02'),
          createdAt: day('2020-03-02'),
          reference: ref('p1'),
          type: PaymentType.FULL_COURSE,
        },
        {
          userId: s2.id,
          courseId: c1.id,
          amount: 80,
          status: PaymentStatus.SUCCESSFUL,
          paidAt: day('2020-03-04'),
          createdAt: day('2020-03-04'),
          reference: ref('p2'),
          type: PaymentType.FULL_COURSE,
        },
        {
          userId: s2.id,
          amount: 20,
          status: PaymentStatus.SUCCESSFUL,
          paidAt: day('2020-03-05'),
          createdAt: day('2020-03-05'),
          reference: ref('p3'),
          type: PaymentType.CREDIT_TOP_UP,
        },
        {
          userId: s2.id,
          courseId: c2.id,
          amount: 60,
          status: PaymentStatus.FAILED,
          createdAt: day('2020-03-04'),
          reference: ref('p4'),
          type: PaymentType.FULL_COURSE,
        },
        {
          userId: s3.id,
          courseId: c2.id,
          amount: 50,
          status: PaymentStatus.SUCCESSFUL,
          paidAt: day('2020-02-26'),
          createdAt: day('2020-02-26'),
          reference: ref('p5'),
          type: PaymentType.FULL_COURSE,
        },
      ],
    });
    await prisma.lessonProgress.createMany({
      data: [
        {
          userId: s1.id,
          lessonId: c1.lessonIds[0],
          completed: true,
          completedAt: day('2020-03-03'),
        },
        {
          userId: s2.id,
          lessonId: c1.lessonIds[0],
          completed: true,
          completedAt: day('2020-03-04'),
        },
        { userId: s2.id, lessonId: c1.lessonIds[1], completed: false },
      ],
    });
    await prisma.studentOnboarding.create({
      data: {
        userId: s1.id,
        isCompleted: true,
        completedAt: day('2020-03-02'),
      },
    });
    await prisma.certificate.create({
      data: {
        serial: ref('cert'),
        userId: s2.id,
        courseId: c1.id,
        recipientName: 'S2',
        courseName: c1Name,
        issuedAt: day('2020-03-05'),
      },
    });
    expect(c2Name).not.toBe(c1Name);
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts stats in the window against the week before', async () => {
    expect(await chart('new-students')).toEqual({ value: 2, previous: 1 });
    expect(await chart('revenue')).toEqual({ value: 200, previous: 50 });
    expect(await chart('enrolments')).toEqual({ value: 2, previous: 1 });
    expect(await chart('lessons-completed')).toEqual({ value: 2, previous: 0 });
    expect(await chart('certificates')).toEqual({ value: 1, previous: 0 });
    expect(await chart('failed-payments')).toEqual({ value: 1, previous: 0 });
  });

  it('draws a point for every day, zeros included', async () => {
    expect(await chart('signups')).toEqual(zeroes({ '02': 1, '03': 1 }));
    expect(await chart('revenue-over-time')).toEqual(
      zeroes({ '02': 100, '04': 80, '05': 20 }),
    );
    expect(await chart('enrolments-over-time')).toEqual(
      zeroes({ '02': 1, '04': 1 }),
    );
  });

  it('names programs in breakdowns, with top-ups as their own slice', async () => {
    expect(await chart('top-programs')).toEqual([{ label: c1Name, value: 2 }]);
    expect(await chart('revenue-by-program')).toEqual([
      { label: c1Name, value: 180 },
      { label: 'Credit top-ups', value: 20 },
    ]);
  });

  it('moves the all-time totals by what was seeded', async () => {
    const after = await totals();
    // s1, s2, s3; the admin and instructor are not students.
    expect(after.students).toBe((before.students as number) + 3);
    const count = (statuses: unknown, label: string): number =>
      (statuses as { label: string; value: number }[]).find(
        (slice) => slice.label === label,
      )?.value ?? 0;
    for (const [label, added] of [
      ['Learning', 2],
      ['Completed', 1],
      ['Checkout not finished', 1],
    ] as const) {
      expect(count(after.statuses, label)).toBe(
        count(before.statuses, label) + added,
      );
    }
  });

  it('answers percentages and the rating as plain numbers', async () => {
    const onboarding = await chart<Stat>('onboarding-completion', {});
    expect(onboarding.value).toBeGreaterThanOrEqual(0);
    expect(onboarding.value).toBeLessThanOrEqual(100);
    expect(typeof (await chart<Stat>('average-rating', {})).value).toBe(
      'number',
    );
  });

  it('follows the week signups through the journey', async () => {
    // s1 and s2 signed up that week, both verified. Only s1 onboarded, so s2's completed program and certificate
    // don't count: a step only counts people who passed every step before it.
    expect(await chart('signup-funnel')).toEqual([
      { label: 'Signed up', value: 2 },
      { label: 'Verified email', value: 2 },
      { label: 'Finished onboarding', value: 1 },
      { label: 'Started a checkout', value: 1 },
      { label: 'Paid for a program', value: 1 },
      { label: 'Completed a lesson', value: 1 },
      { label: 'Completed a program', value: 0 },
      { label: 'Got a certificate', value: 0 },
    ]);
  });

  it('rejects a bad window with a 400', async () => {
    await http()
      .get(`${BASE}/revenue`)
      .query({ ...WEEK, from: '2020-03-09' })
      .set(auth(admin))
      .expect(400);
    await http()
      .get(`${BASE}/revenue`)
      .query({ ...WEEK, interval: 'week' })
      .set(auth(admin))
      .expect(400);
    await http()
      .get(`${BASE}/revenue`)
      .query({ ...WEEK, from: 'yesterday' })
      .set(auth(admin))
      .expect(400);
  });

  it('keeps students out', async () => {
    await http()
      .get(`${BASE}/revenue`)
      .query(WEEK)
      .set(auth(student))
      .expect(403);
  });
});
