import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  CourseStatus,
  EnrollmentStatus,
  LiveSessionStatus,
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

const DAY_MS = 24 * 60 * 60 * 1000;
const fromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

describe("A learner's session calendar (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creator: SeededUser;
  let learner: SeededUser;
  let enrolledCourseId: string;
  let otherCourseId: string;

  const http = () => request(app.getHttpServer());

  const scheduleWindow = (fromDays: number, toDays: number) => ({
    from: fromNow(fromDays).toISOString(),
    to: fromNow(toDays).toISOString(),
  });

  const createSession = (
    courseId: string,
    title: string,
    days: number,
    status: LiveSessionStatus = LiveSessionStatus.SCHEDULED,
  ) =>
    prisma.liveSession.create({
      data: {
        title,
        type: 'Lecture',
        scheduledAt: fromNow(days),
        durationMins: 60,
        status,
        courseId,
        creatorId: creator.id,
      },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    creator = await seedUser(app, 'calendar-creator', UserRole.INSTRUCTOR);
    learner = await seedUser(app, 'calendar-learner', UserRole.USER);

    enrolledCourseId = (
      await seedCourse(app, creator.id, 1, CourseStatus.PUBLISHED)
    ).id;
    otherCourseId = (
      await seedCourse(app, creator.id, 1, CourseStatus.PUBLISHED)
    ).id;
    await prisma.enrollment.create({
      data: {
        userId: learner.id,
        courseId: enrolledCourseId,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await createSession(
      enrolledCourseId,
      'Earlier this week',
      -2,
      LiveSessionStatus.ENDED,
    );
    await createSession(enrolledCourseId, 'Tomorrow', 1);
    await createSession(
      enrolledCourseId,
      'Called off',
      2,
      LiveSessionStatus.CANCELLED,
    );
    await createSession(enrolledCourseId, 'Next month', 40);
    await createSession(otherCourseId, 'Not my program', 1);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns only the learner's programs' sessions in the window, oldest first", async () => {
    const response = await http()
      .get('/live-sessions/schedule')
      .query(scheduleWindow(-7, 7))
      .set(auth(learner))
      .expect(200);

    const titles = response.body.map(
      (session: { title: string }) => session.title,
    );
    expect(titles).toEqual(['Earlier this week', 'Tomorrow']);
    expect(response.body[1]).toMatchObject({
      courseId: enrolledCourseId,
      status: LiveSessionStatus.SCHEDULED,
    });
  });

  it('refuses a window that ends before it starts', async () => {
    await http()
      .get('/live-sessions/schedule')
      .query(scheduleWindow(7, -7))
      .set(auth(learner))
      .expect(400);
  });

  it('refuses a window longer than the limit', async () => {
    await http()
      .get('/live-sessions/schedule')
      .query(scheduleWindow(0, 90))
      .set(auth(learner))
      .expect(400);
  });

  it('refuses missing dates', async () => {
    await http().get('/live-sessions/schedule').set(auth(learner)).expect(400);
  });

  it('needs a signed-in user', async () => {
    await http()
      .get('/live-sessions/schedule')
      .query(scheduleWindow(-7, 7))
      .expect(401);
  });
});
