import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  EnrollmentStatus,
  EnrollmentType,
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

const SECRET_VIDEO_URL = 'https://cdn.test/secret/master.m3u8';
// $100,000 tuition on a one-module program -> 100,000 credits for full access.
const FULL_COURSE_CREDITS = 100_000;

describe('Lesson paywall, credit double-spend and completion integrity (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creator: SeededUser;
  let outsider: SeededUser;
  let learner: SeededUser;
  let courseId: string;
  let moduleId: string;
  let noteLessonId: string;
  let videoLessonId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    creator = await seedUser(app, 'pw-creator', UserRole.INSTRUCTOR);
    outsider = await seedUser(app, 'pw-outsider', UserRole.USER);
    learner = await seedUser(app, 'pw-learner', UserRole.USER);

    const course = await seedCourse(app, creator.id, 1);
    courseId = course.id;
    moduleId = course.moduleId;
    noteLessonId = course.lessonIds[0];
    const video = await prisma.lesson.create({
      data: {
        moduleId,
        title: 'Paid video',
        contentType: 'video',
        videoUrl: SECRET_VIDEO_URL,
        videoProcessingError: 'internal transcoder detail',
        duration: 10,
        order: 1,
      },
    });
    videoLessonId = video.id;
    await prisma.enrollment.create({
      data: {
        userId: learner.id,
        courseId,
        type: EnrollmentType.FULL_COURSE,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /lessons?moduleId=', () => {
    it('requires a login', async () => {
      await http().get(`/lessons?moduleId=${moduleId}`).expect(401);
    });

    it('locks every lesson for a learner without module access', async () => {
      const response = await http()
        .get(`/lessons?moduleId=${moduleId}`)
        .set(auth(outsider))
        .expect(200);
      expect(response.body.total).toBe(2);
      for (const lesson of response.body.lessons) {
        expect(lesson).toMatchObject({
          locked: true,
          videoUrl: null,
          content: null,
        });
        expect(lesson).not.toHaveProperty('videoProcessingError');
      }
      expect(JSON.stringify(response.body)).not.toContain(SECRET_VIDEO_URL);
    });

    it('returns full content to the course creator and enrolled learners', async () => {
      for (const user of [creator, learner]) {
        const response = await http()
          .get(`/lessons?moduleId=${moduleId}`)
          .set(auth(user))
          .expect(200);
        const video = response.body.lessons.find(
          (lesson: { id: string }) => lesson.id === videoLessonId,
        );
        expect(video).toMatchObject({
          locked: false,
          videoUrl: SECRET_VIDEO_URL,
        });
      }
    });

    it('404s for an unknown module', async () => {
      await http()
        .get('/lessons?moduleId=00000000-0000-0000-0000-000000000000')
        .set(auth(creator))
        .expect(404);
    });
  });

  describe('GET /media/lessons/:id/transcode-status', () => {
    it("refuses anyone but the lesson's creator or an admin", async () => {
      for (const user of [outsider, learner]) {
        const response = await http()
          .get(`/media/lessons/${videoLessonId}/transcode-status`)
          .set(auth(user))
          .expect(403);
        expect(JSON.stringify(response.body)).not.toContain(SECRET_VIDEO_URL);
      }
    });

    it('returns the status to the creator without leaking the course owner', async () => {
      const response = await http()
        .get(`/media/lessons/${videoLessonId}/transcode-status`)
        .set(auth(creator))
        .expect(200);
      expect(response.body).toMatchObject({ videoUrl: SECRET_VIDEO_URL });
      expect(response.body).not.toHaveProperty('module');
    });
  });

  describe('credit purchases', () => {
    it('never overdraws the wallet when two purchases race', async () => {
      const buyer = await seedUser(app, 'pw-racer', UserRole.USER);
      await prisma.user.update({
        where: { id: buyer.id },
        data: { credits: FULL_COURSE_CREDITS },
      });
      const first = await seedCourse(app, creator.id, 1);
      const second = await seedCourse(app, creator.id, 1);

      const results = await Promise.all(
        [first, second].map((course) =>
          http()
            .post('/enrollments/purchase')
            .set(auth(buyer))
            .send({ courseId: course.id, type: EnrollmentType.FULL_COURSE }),
        ),
      );

      expect(results.map((result) => result.status).sort()).toEqual([
        201, 400,
      ]);
      const wallet = await prisma.user.findUniqueOrThrow({
        where: { id: buyer.id },
      });
      expect(wallet.credits).toBe(0);
      const enrollments = await prisma.enrollment.count({
        where: { userId: buyer.id },
      });
      expect(enrollments).toBe(1);
    });
  });

  describe('lesson completion', () => {
    it("ignores a player-reported length shorter than the creator's duration", async () => {
      await http()
        .get(`/lessons/${videoLessonId}/engagement`)
        .set(auth(learner))
        .expect(200);
      const beat = await http()
        .post(`/lessons/${videoLessonId}/engagement`)
        .set(auth(learner))
        .send({ seconds: 0, videoDurationSeconds: 1 })
        .expect(200);
      // 80% of the creator's 10 minutes, not of the reported 1 second.
      expect(beat.body.requiredSeconds).toBe(480);
      await http()
        .post(`/lessons/${videoLessonId}/complete`)
        .set(auth(learner))
        .expect(409);
    });

    it('credits almost nothing for a burst of rapid heartbeats', async () => {
      await http()
        .get(`/lessons/${noteLessonId}/engagement`)
        .set(auth(learner))
        .expect(200);
      let engagedSeconds = 0;
      for (let beat = 0; beat < 10; beat += 1) {
        const response = await http()
          .post(`/lessons/${noteLessonId}/engagement`)
          .set(auth(learner))
          .send({ seconds: 60 })
          .expect(200);
        engagedSeconds = response.body.engagedSeconds;
      }
      // A flat 5s allowance per beat would have credited ~50s here.
      expect(engagedSeconds).toBeLessThan(5);
    });
  });
});
