import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { CourseStatus, UserRole } from '../src/generated/prisma/client';
import { NotificationService } from '../src/notification/notification.service';
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

describe('Programs run as cohorts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let creator: SeededUser;

  const http = () => request(app.getHttpServer());

  const schedule = (
    courseId: string,
    days: { starts: number; closes: number; ends: number },
    maxCohortSize = 30,
  ) =>
    prisma.course.update({
      where: { id: courseId },
      data: {
        startsAt: fromNow(days.starts),
        enrollmentClosesAt: fromNow(days.closes),
        endsAt: fromNow(days.ends),
        maxCohortSize,
      },
    });

  const buyer = async (label: string) => {
    const user = await seedUser(app, label, UserRole.USER);
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: 100_000 },
    });
    return user;
  };

  const buy = (user: SeededUser, courseId: string) =>
    http()
      .post('/enrollments/purchase')
      .set(auth(user))
      .send({ courseId, type: 'FULL_COURSE' });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    admin = await seedUser(app, 'schedule-admin', UserRole.ADMIN);
    creator = await seedUser(app, 'schedule-creator', UserRole.INSTRUCTOR);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('submitting for review', () => {
    it('needs the start, cutoff and end dates', async () => {
      const { id } = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      const response = await http()
        .post(`/course/${id}/submit-for-review`)
        .set(auth(creator))
        .expect(400);
      expect(response.body.message).toContain('set the start date');
    });

    it('refuses dates out of order when editing', async () => {
      const { id } = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      await http()
        .patch(`/course/${id}`)
        .set(auth(creator))
        .field('startsAt', fromNow(30).toISOString())
        .field('enrollmentClosesAt', fromNow(90).toISOString())
        .field('endsAt', fromNow(60).toISOString())
        .expect(400);
    });

    it('refuses a program starting in less than 7 days', async () => {
      const { id } = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      await schedule(id, { starts: 3, closes: 10, ends: 60 });
      const response = await http()
        .post(`/course/${id}/submit-for-review`)
        .set(auth(creator))
        .expect(400);
      expect(response.body.message).toContain('at least 7 days');
    });

    it('submits, is reviewed on the full page, and goes live', async () => {
      const { id } = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      await schedule(id, { starts: 14, closes: 21, ends: 60 });
      await http()
        .post(`/course/${id}/submit-for-review`)
        .set(auth(creator))
        .expect(201);
      const notification = await prisma.notification.findFirst({
        where: { userId: admin.id, type: 'program-review' },
        orderBy: { createdAt: 'desc' },
      });
      expect(notification?.link).toBe(`/admin/programs/${id}/review`);

      const review = await http()
        .get(`/admin/programs/${id}/review`)
        .set(auth(admin))
        .expect(200);
      expect(review.body.modules[0].lessons).toHaveLength(1);
      expect(review.body.startsAt).toEqual(expect.any(String));
      await http()
        .get(`/admin/programs/${id}/review`)
        .set(auth(creator))
        .expect(403);

      await http()
        .patch(`/admin/programs/${id}/start-review`)
        .set(auth(admin))
        .expect(200);
      await http()
        .patch(`/admin/programs/${id}/review`)
        .set(auth(admin))
        .send({ status: 'ACTIVE' })
        .expect(200);
      const course = await prisma.course.findUniqueOrThrow({ where: { id } });
      expect(course.status).toBe(CourseStatus.ACTIVE);
    });
  });

  describe('checkout', () => {
    it('sells seats up to the cohort size while enrollment is open', async () => {
      const { id } = await seedCourse(app, creator.id, 1);
      await schedule(id, { starts: 14, closes: 21, ends: 60 }, 1);
      await buy(await buyer('first-seat'), id).expect(201);
      const full = await buy(await buyer('too-late'), id).expect(409);
      expect(full.body.message).toBe('This program is full.');
    });

    it('refuses new seats after the cutoff until it ends', async () => {
      const { id } = await seedCourse(app, creator.id, 1);
      await schedule(id, { starts: -10, closes: -3, ends: 30 });
      const response = await buy(await buyer('closed'), id).expect(400);
      expect(response.body.message).toContain('reopens as a rewatch');
    });

    it('sells an ended program as a rewatch past its cohort size', async () => {
      const { id } = await seedCourse(app, creator.id, 1);
      await schedule(id, { starts: -90, closes: -80, ends: -1 }, 1);
      await buy(await buyer('rewatch-1'), id).expect(201);
      await buy(await buyer('rewatch-2'), id).expect(201);
    });
  });

  describe('session recordings', () => {
    it('shows recordings to enrolled learners but never publicly', async () => {
      const { id } = await seedCourse(app, creator.id, 1);
      const learner = await buyer('recordings');
      await buy(learner, id).expect(201);

      const created = await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Kickoff',
          type: 'Lecture',
          platform: 'Zoom',
          scheduledAt: fromNow(-1).toISOString(),
          durationMins: 60,
          courseId: id,
          meetingLink: 'https://zoom.us/j/1',
        })
        .expect(201);
      await http()
        .patch(`/live-sessions/${created.body.session.id}`)
        .set(auth(creator))
        .send({ recordingUrl: 'https://youtu.be/replay' })
        .expect(200);

      const mine = await http()
        .get(`/live-sessions/course/${id}/recordings`)
        .set(auth(learner))
        .expect(200);
      expect(mine.body.sessions[0].recordingUrl).toBe(
        'https://youtu.be/replay',
      );

      const outsider = await seedUser(app, 'outsider', UserRole.USER);
      await http()
        .get(`/live-sessions/course/${id}/recordings`)
        .set(auth(outsider))
        .expect(403);
      const publicList = await http()
        .get('/live-sessions')
        .query({ courseId: id })
        .expect(200);
      expect(publicList.body.sessions[0].recordingUrl).toBeUndefined();
    });
  });
});
