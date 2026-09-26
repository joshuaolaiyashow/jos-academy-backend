import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { OAuthProviderClient } from '../src/auth/oauth/oauth-provider.client';
import type { OAuthProfile } from '../src/auth/oauth/oauth.types';
import {
  CourseStatus,
  EnrollmentStatus,
  EnrollmentType,
  LiveSessionStatus,
  UserRole,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  createE2eApp,
  seedCourse,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

class FakeOAuthProviderClient {
  profile: OAuthProfile = {
    email: 'oauth.learner@example.com',
    emailVerified: true,
    name: 'OAuth Learner',
    picture: 'https://example.com/avatar.png',
  };

  exchangeCodeForProfile(): Promise<OAuthProfile> {
    return Promise.resolve(this.profile);
  }
}

describe('Academy features (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const fakeOAuthClient = new FakeOAuthProviderClient();

  let admin: SeededUser;
  let creator: SeededUser;
  let otherCreator: SeededUser;
  let learner: SeededUser;
  let outsider: SeededUser;
  let courseId: string;
  let otherCourseId: string;
  let lessonIds: string[];

  const http = () => request(app.getHttpServer());
  const auth = authHeader;

  beforeAll(async () => {
    app = await createE2eApp([
      { token: OAuthProviderClient, value: fakeOAuthClient },
    ]);
    prisma = app.get(PrismaService);

    admin = await seedUser(app, 'admin', UserRole.ADMIN);
    creator = await seedUser(app, 'creator', UserRole.INSTRUCTOR);
    otherCreator = await seedUser(app, 'other-creator', UserRole.INSTRUCTOR);
    learner = await seedUser(app, 'learner', UserRole.USER);
    outsider = await seedUser(app, 'outsider', UserRole.USER);

    const course = await seedCourse(app, creator.id, 2);
    courseId = course.id;
    lessonIds = course.lessonIds;

    const otherCourse = await seedCourse(app, otherCreator.id, 1);
    otherCourseId = otherCourse.id;

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

  it('never exposes lesson bodies or video URLs in the public catalog', async () => {
    const response = await http().get(`/explore/${courseId}`).expect(200);
    const lesson = response.body.modules[0].lessons[0];
    expect(lesson).toMatchObject({ id: lessonIds[0], title: 'Lesson 1' });
    expect(lesson).not.toHaveProperty('content');
    expect(lesson).not.toHaveProperty('videoUrl');
  });

  it('lets admins and the course creator preview full lesson content', async () => {
    for (const viewer of [admin, creator]) {
      const response = await http()
        .get(`/lessons/${lessonIds[0]}`)
        .set(auth(viewer))
        .expect(200);
      expect(response.body).toMatchObject({ locked: false, content: 'Body' });
    }
    const outsiderView = await http()
      .get(`/lessons/${lessonIds[0]}`)
      .set(auth(outsider))
      .expect(200);
    expect(outsiderView.body).toMatchObject({ locked: true, content: null });
  });

  describe('lesson notes', () => {
    it('requires authentication', async () => {
      await http().get(`/lessons/${lessonIds[0]}/note`).expect(401);
    });

    it('returns an empty note before anything is saved', async () => {
      const response = await http()
        .get(`/lessons/${lessonIds[0]}/note`)
        .set(auth(learner))
        .expect(200);
      expect(response.body).toEqual({ content: '', updatedAt: null });
    });

    it('saves and reloads the learner note', async () => {
      await http()
        .put(`/lessons/${lessonIds[0]}/note`)
        .set(auth(learner))
        .send({ content: 'Sensors talk over I2C.' })
        .expect(200);

      const response = await http()
        .get(`/lessons/${lessonIds[0]}/note`)
        .set(auth(learner))
        .expect(200);
      expect(response.body.content).toBe('Sensors talk over I2C.');
      expect(response.body.updatedAt).toEqual(expect.any(String));
    });

    it('forbids learners without access to the lesson', async () => {
      await http()
        .put(`/lessons/${lessonIds[0]}/note`)
        .set(auth(outsider))
        .send({ content: 'sneaky' })
        .expect(403);
    });

    it('rejects oversized notes', async () => {
      await http()
        .put(`/lessons/${lessonIds[0]}/note`)
        .set(auth(learner))
        .send({ content: 'x'.repeat(20_001) })
        .expect(400);
    });
  });

  describe('lesson discussions', () => {
    let threadId: string;

    it('lets an enrolled learner start a thread', async () => {
      const response = await http()
        .post(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(learner))
        .send({ body: '  How do sensors talk to the processor?  ' })
        .expect(201);
      threadId = response.body.id;
      expect(response.body.body).toBe('How do sensors talk to the processor?');
      expect(response.body.author).toMatchObject({ id: learner.id });
      expect(response.body.parentId).toBeNull();
    });

    it('lets the course creator reply and notifies the thread author', async () => {
      await http()
        .post(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(creator))
        .send({ body: 'Over I2C or SPI.', parentId: threadId })
        .expect(201);

      const notification = await prisma.notification.findFirst({
        where: { userId: learner.id, type: 'discussion-reply' },
      });
      expect(notification).not.toBeNull();
    });

    it('attaches a reply-to-a-reply to the original thread', async () => {
      const reply = await prisma.lessonDiscussion.findFirstOrThrow({
        where: { parentId: threadId },
      });
      const response = await http()
        .post(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(learner))
        .send({ body: 'Thanks!', parentId: reply.id })
        .expect(201);
      expect(response.body.parentId).toBe(threadId);
    });

    it('lists threads with their replies and marks the instructor', async () => {
      const response = await http()
        .get(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(learner))
        .expect(200);
      const thread = response.body.threads.find(
        (entry: { id: string }) => entry.id === threadId,
      );
      expect(thread.replies).toHaveLength(2);
      expect(thread.replies[0].author).toMatchObject({
        id: creator.id,
        isInstructor: true,
      });
    });

    it('rejects a parent from a different lesson', async () => {
      await http()
        .post(`/lessons/${lessonIds[1]}/discussions`)
        .set(auth(learner))
        .send({ body: 'Wrong lesson', parentId: threadId })
        .expect(400);
    });

    it('rejects an empty body', async () => {
      await http()
        .post(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(learner))
        .send({ body: '   ' })
        .expect(400);
    });

    it('forbids users without access to read or post', async () => {
      await http()
        .get(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(outsider))
        .expect(403);
      await http()
        .post(`/lessons/${lessonIds[0]}/discussions`)
        .set(auth(otherCreator))
        .send({ body: 'Not my course' })
        .expect(403);
    });
  });

  describe('course completion and certificates', () => {
    it('refuses to complete a lesson the user cannot access', async () => {
      await http()
        .post(`/lessons/${lessonIds[0]}/complete`)
        .set(auth(outsider))
        .expect(403);
    });

    it('issues exactly one certificate once every lesson is complete', async () => {
      await http()
        .post(`/lessons/${lessonIds[0]}/complete`)
        .set(auth(learner))
        .expect(201);

      let enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: learner.id, courseId } },
      });
      expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);

      await http()
        .post(`/lessons/${lessonIds[1]}/complete`)
        .set(auth(learner))
        .expect(201);
      await http()
        .post(`/lessons/${lessonIds[1]}/complete`)
        .set(auth(learner))
        .expect(201);

      enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { userId_courseId: { userId: learner.id, courseId } },
      });
      expect(enrollment.status).toBe(EnrollmentStatus.COMPLETED);
      expect(
        await prisma.certificate.count({
          where: { userId: learner.id, courseId },
        }),
      ).toBe(1);
    });

    it('reports progress as lessons completed, not modules unlocked', async () => {
      const response = await http()
        .get('/enrollments/my-courses')
        .set(auth(learner))
        .expect(200);
      const enrollment = response.body.enrollments.find(
        (entry: { courseId: string }) => entry.courseId === courseId,
      );
      expect(enrollment).toMatchObject({
        completedLessonsCount: 2,
        totalLessonsCount: 2,
        progressPercent: 100,
        status: 'COMPLETED',
      });
    });

    it('keeps lesson access after the course is completed', async () => {
      const response = await http()
        .get(`/lessons/${lessonIds[0]}`)
        .set(auth(learner))
        .expect(200);
      expect(response.body.locked).toBe(false);
    });

    it("lists the learner's certificates", async () => {
      const response = await http()
        .get('/certificates/me')
        .set(auth(learner))
        .expect(200);
      expect(response.body.certificates).toHaveLength(1);
      expect(response.body.certificates[0]).toMatchObject({ courseId });
    });

    it('verifies a certificate publicly without exposing private data', async () => {
      const certificate = await prisma.certificate.findFirstOrThrow({
        where: { userId: learner.id },
      });
      const response = await http()
        .get(`/certificates/${certificate.id}`)
        .expect(200);
      expect(response.body).toMatchObject({
        id: certificate.id,
        serial: certificate.serial,
        recipientName: 'learner User',
        instructorName: 'creator User',
        durationLabel: '8 Weeks',
      });
      expect(JSON.stringify(response.body)).not.toContain(learner.email);
    });

    it('returns 404 for an unknown certificate', async () => {
      await http()
        .get('/certificates/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('does not let a completed learner buy the course again', async () => {
      await http()
        .post('/enrollments/purchase')
        .set(auth(learner))
        .send({ courseId, type: EnrollmentType.FULL_COURSE })
        .expect(409);
    });
  });

  describe('live sessions', () => {
    let sessionId: string;

    it('rejects a non-https meeting link', async () => {
      await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Sensors Q&A',
          type: 'QandA',
          platform: 'Zoom',
          meetingLink: 'javascript:alert(1)',
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          durationMins: 60,
          courseId,
        })
        .expect(400);
    });

    it("forbids scheduling a session on someone else's course", async () => {
      await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Hijack',
          type: 'Lecture',
          platform: 'Zoom',
          meetingLink: 'https://zoom.us/j/1',
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          durationMins: 60,
          courseId: otherCourseId,
        })
        .expect(403);
    });

    it('lets the owner schedule a session on a live program', async () => {
      await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Office hours',
          type: 'QandA',
          platform: 'Zoom',
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          durationMins: 60,
          courseId,
        })
        .expect(201);
    });

    it('lets the owner schedule a session with a real meeting link', async () => {
      // Sessions are scheduled while the program is still editable, before approval.
      await prisma.course.update({
        where: { id: courseId },
        data: { status: CourseStatus.DRAFT },
      });
      const response = await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Sensors Q&A',
          type: 'QandA',
          platform: 'Zoom',
          meetingLink: 'https://zoom.us/j/1234567890',
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
          durationMins: 60,
          courseId,
        })
        .expect(201);
      sessionId = response.body.session.id;
      expect(response.body.session.meetingLink).toBe(
        'https://zoom.us/j/1234567890',
      );
      await prisma.course.update({
        where: { id: courseId },
        data: { status: CourseStatus.ACTIVE },
      });
    });

    it('lets the owner update the meeting link', async () => {
      const response = await http()
        .patch(`/live-sessions/${sessionId}`)
        .set(auth(creator))
        .send({ meetingLink: 'https://zoom.us/j/999' })
        .expect(200);
      expect(response.body.session.meetingLink).toBe('https://zoom.us/j/999');

      await http()
        .patch(`/live-sessions/${sessionId}`)
        .set(auth(otherCreator))
        .send({ meetingLink: 'https://zoom.us/j/evil' })
        .expect(403);
    });

    it('never exposes meeting links or attendees publicly', async () => {
      const list = await http()
        .get(`/live-sessions?courseId=${courseId}`)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain('zoom.us');

      await http().get(`/live-sessions/${sessionId}`).expect(401);
      await http()
        .get(`/live-sessions/${sessionId}`)
        .set(auth(outsider))
        .expect(403);
    });

    it('lists the session on the learner dashboard without the link', async () => {
      const response = await http()
        .get('/dashboard')
        .set(auth(learner))
        .expect(200);
      const session = response.body.upcomingLiveSessions.find(
        (entry: { id: string }) => entry.id === sessionId,
      );
      expect(session).toBeDefined();
      expect(session).not.toHaveProperty('meetingLink');

      const explore = await http()
        .get(`/explore/${courseId}`)
        .set(auth(learner))
        .expect(200);
      expect(JSON.stringify(explore.body)).not.toContain('zoom.us');
    });

    it('only lets enrolled learners join once the session is live', async () => {
      await http()
        .post(`/live-sessions/${sessionId}/join`)
        .set(auth(learner))
        .expect(409);

      await http()
        .patch(`/live-sessions/${sessionId}/status`)
        .set(auth(creator))
        .send({ status: LiveSessionStatus.LIVE })
        .expect(200);

      await http()
        .post(`/live-sessions/${sessionId}/join`)
        .set(auth(outsider))
        .expect(403);

      const joined = await http()
        .post(`/live-sessions/${sessionId}/join`)
        .set(auth(learner))
        .expect(201);

      const dashboard = await http()
        .get('/dashboard')
        .set(auth(learner))
        .expect(200);
      expect(
        dashboard.body.upcomingLiveSessions.map(
          (entry: { id: string }) => entry.id,
        ),
      ).toContain(sessionId);
      expect(joined.body.meetingLink).toBe('https://zoom.us/j/999');

      const attendance = await http()
        .get(`/live-sessions/${sessionId}/attendance`)
        .set(auth(creator))
        .expect(200);
      expect(attendance.body.attendance).toEqual([
        expect.objectContaining({ userId: learner.id, status: 'ATTENDED' }),
      ]);
    });
  });

  describe('OAuth sign-in', () => {
    const startGoogle = async () => {
      const response = await http().get('/auth/oauth/google').expect(302);
      const location = new URL(response.headers.location);
      const cookie = response.headers['set-cookie'] as unknown as string[];
      return { location, cookie, state: location.searchParams.get('state')! };
    };

    const callbackCode = (location: string) =>
      new URL(location).searchParams.get('code');

    it('lists only providers that are configured', async () => {
      const response = await http().get('/auth/oauth/providers').expect(200);
      expect(response.body).toEqual({ providers: ['google'] });
    });

    it('returns 404 for an unconfigured provider', async () => {
      await http().get('/auth/oauth/linkedin').expect(404);
    });

    it('redirects to Google with a state bound to an httpOnly cookie', async () => {
      const { location, cookie, state } = await startGoogle();
      expect(location.origin).toBe('https://accounts.google.com');
      expect(location.searchParams.get('redirect_uri')).toBe(
        'http://api.test/auth/oauth/google/callback',
      );
      expect(state).toHaveLength(64);
      expect(cookie.join(';')).toMatch(/HttpOnly/i);
    });

    it('rejects a callback whose state does not match the cookie', async () => {
      const { cookie } = await startGoogle();
      const response = await http()
        .get('/auth/oauth/google/callback?code=abc&state=forged')
        .set('Cookie', cookie)
        .expect(302);
      expect(response.headers.location).toBe(
        'http://frontend.test/auth/callback?error=OAUTH_STATE_MISMATCH',
      );
    });

    it('creates a verified learner and hands back a single-use exchange code', async () => {
      const { cookie, state } = await startGoogle();
      const callback = await http()
        .get(`/auth/oauth/google/callback?code=abc&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);
      const code = callbackCode(callback.headers.location);
      expect(callback.headers.location).toMatch(
        /^http:\/\/frontend\.test\/auth\/callback\?code=/,
      );

      const exchange = await http()
        .post('/auth/oauth/exchange')
        .send({ code })
        .expect(200);
      expect(exchange.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          email: 'oauth.learner@example.com',
          role: UserRole.USER,
          isEmailVerified: true,
        },
      });

      await http().post('/auth/oauth/exchange').send({ code }).expect(401);
    });

    it('refuses provider accounts with an unverified email', async () => {
      fakeOAuthClient.profile = {
        ...fakeOAuthClient.profile,
        email: 'unverified@example.com',
        emailVerified: false,
      };
      const { cookie, state } = await startGoogle();
      const callback = await http()
        .get(`/auth/oauth/google/callback?code=abc&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);
      expect(callback.headers.location).toBe(
        'http://frontend.test/auth/callback?error=OAUTH_EMAIL_UNVERIFIED',
      );
    });

    it('invalidates the password on an unverified account it takes over', async () => {
      const squatted = await prisma.user.create({
        data: {
          email: `squatted-${Date.now()}@example.com`,
          name: 'Squatter',
          password: 'attacker-known-hash',
          isEmailVerified: false,
        },
      });
      fakeOAuthClient.profile = {
        email: squatted.email,
        emailVerified: true,
        name: 'Real Owner',
      };
      const { cookie, state } = await startGoogle();
      await http()
        .get(`/auth/oauth/google/callback?code=abc&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);

      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: squatted.id },
      });
      expect(updated.isEmailVerified).toBe(true);
      expect(updated.password).not.toBe('attacker-known-hash');
    });

    it('refuses suspended accounts', async () => {
      const suspended = await prisma.user.create({
        data: {
          email: `suspended-${Date.now()}@example.com`,
          name: 'Suspended',
          password: 'x',
          isEmailVerified: true,
          isSuspended: true,
        },
      });
      fakeOAuthClient.profile = {
        email: suspended.email,
        emailVerified: true,
        name: 'Suspended',
      };
      const { cookie, state } = await startGoogle();
      const callback = await http()
        .get(`/auth/oauth/google/callback?code=abc&state=${state}`)
        .set('Cookie', cookie)
        .expect(302);
      expect(callback.headers.location).toBe(
        'http://frontend.test/auth/callback?error=ACCOUNT_SUSPENDED',
      );
    });
  });

  it('keeps admins able to read any session attendance', async () => {
    const session = await prisma.liveSession.findFirstOrThrow({
      where: { courseId },
    });
    await http()
      .get(`/live-sessions/${session.id}/attendance`)
      .set(auth(admin))
      .expect(200);
  });
});
