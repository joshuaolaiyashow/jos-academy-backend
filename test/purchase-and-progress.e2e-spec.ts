import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { EnrollmentType, UserRole } from '../src/generated/prisma/client';
import { NotificationService } from '../src/notification/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedCourse,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

describe('Top-up minimum, multi-module purchase and lesson completion gate (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creator: SeededUser;
  let learner: SeededUser;
  let courseId: string;
  let moduleIds: string[];
  let lessonId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    creator = await seedUser(app, 'buy-creator', UserRole.INSTRUCTOR);
    learner = await seedUser(app, 'buy-learner', UserRole.USER);

    const course = await seedCourse(app, creator.id, 1);
    courseId = course.id;
    lessonId = course.lessonIds[0];
    const extra = await Promise.all(
      ['Module 2', 'Module 3'].map((title, index) =>
        prisma.modules.create({
          data: {
            title,
            description: 'More',
            lessonsCount: 0,
            courseId,
            order: index + 1,
          },
        }),
      ),
    );
    moduleIds = [course.moduleId, ...extra.map((module) => module.id)];
    await prisma.user.update({
      where: { id: learner.id },
      data: { credits: 500_000 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects credit top-ups under 10 credits', async () => {
    const response = await http()
      .post('/credits/buy')
      .set(auth(learner))
      .send({ credits: 9 })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('10 credits');
  });

  it('unlocks several modules in one purchase at the per-module price', async () => {
    // $100,000 tuition -> 100,000 credits over 3 modules -> 33,334 each.
    const response = await http()
      .post('/enrollments/purchase')
      .set(auth(learner))
      .send({
        courseId,
        type: EnrollmentType.MODULAR,
        moduleIds: moduleIds.slice(0, 2),
      })
      .expect(201);
    expect(response.body).toMatchObject({
      moduleIds: moduleIds.slice(0, 2),
      creditsDeducted: 33_334 * 2,
    });
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: learner.id, courseId } },
      include: { enrolledModules: true },
    });
    expect(enrollment.enrolledModules).toHaveLength(2);
    expect(enrollment.type).toBe(EnrollmentType.MODULAR);
  });

  it('refuses a bundle that includes an owned or foreign module', async () => {
    await http()
      .post('/enrollments/purchase')
      .set(auth(learner))
      .send({ courseId, type: EnrollmentType.MODULAR, moduleIds })
      .expect(409);
    await http()
      .post('/enrollments/purchase')
      .set(auth(learner))
      .send({
        courseId,
        type: EnrollmentType.MODULAR,
        moduleIds: ['00000000-0000-0000-0000-000000000000'],
      })
      .expect(400);
  });

  it('upgrades to full access once the last module is bought', async () => {
    await http()
      .post('/enrollments/purchase')
      .set(auth(learner))
      .send({
        courseId,
        type: EnrollmentType.MODULAR,
        moduleIds: [moduleIds[2]],
      })
      .expect(201);
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { userId_courseId: { userId: learner.id, courseId } },
    });
    expect(enrollment.type).toBe(EnrollmentType.FULL_COURSE);
  });

  it('will not mark a lesson complete before its reading time', async () => {
    const engagement = await http()
      .get(`/lessons/${lessonId}/engagement`)
      .set(auth(learner))
      .expect(200);
    // A one-word note still needs the 30-second floor.
    expect(engagement.body).toEqual({
      engagedSeconds: 0,
      requiredSeconds: 30,
      canComplete: false,
    });

    const refused = await http()
      .post(`/lessons/${lessonId}/complete`)
      .set(auth(learner))
      .expect(409);
    // Errors are normalized to { message, code }; the countdown comes from GET /engagement.
    expect(refused.body).toMatchObject({ code: 'CONFLICT' });
  });

  it('credits no more time than has really passed', async () => {
    const beat = await http()
      .post(`/lessons/${lessonId}/engagement`)
      .set(auth(learner))
      .send({ seconds: 60 })
      .expect(200);
    // The viewing session started a moment ago, so ~5s of slack at most.
    expect(beat.body.engagedSeconds).toBeLessThanOrEqual(6);

    await http()
      .post(`/lessons/${lessonId}/engagement`)
      .set(auth(learner))
      .send({ seconds: 121 })
      .expect(400);
  });

  it('completes the lesson once enough time is recorded', async () => {
    await prisma.lessonProgress.update({
      where: { userId_lessonId: { userId: learner.id, lessonId } },
      data: { engagedSeconds: 30 },
    });
    await http()
      .post(`/lessons/${lessonId}/complete`)
      .set(auth(learner))
      .expect(201);
  });
});
