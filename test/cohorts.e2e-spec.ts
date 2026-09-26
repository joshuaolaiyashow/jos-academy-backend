import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  CohortStatus,
  CourseStatus,
  EnrollmentStatus,
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

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) =>
  new Date(Date.now() + days * DAY_MS).toISOString();

const cohortDates = (startInDays: number) => ({
  startsAt: inDays(startInDays),
  enrollmentClosesAt: inDays(startInDays + 7),
  endsAt: inDays(startInDays + 60),
});

describe('Cohorts and cohort review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let creator: SeededUser;
  let otherCreator: SeededUser;
  let courseId: string;
  let moduleId: string;
  let cohortId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    admin = await seedUser(app, 'cohort-admin', UserRole.ADMIN);
    creator = await seedUser(app, 'cohort-creator', UserRole.INSTRUCTOR);
    otherCreator = await seedUser(app, 'cohort-other', UserRole.INSTRUCTOR);
    // A draft program, so only the cohort lock (not the old program lock) is in play.
    const course = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
    courseId = course.id;
    moduleId = course.moduleId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft cohort with the program seat cap by default', async () => {
    const response = await http()
      .post('/cohorts')
      .set(auth(creator))
      .send({ courseId, name: 'October 2026', ...cohortDates(30) })
      .expect(201);
    cohortId = response.body.id;
    expect(response.body).toMatchObject({ status: 'DRAFT', seatCap: 30 });
  });

  it("refuses a cohort on someone else's program", async () => {
    await http()
      .post('/cohorts')
      .set(auth(otherCreator))
      .send({ courseId, name: 'Hijack', ...cohortDates(30) })
      .expect(403);
  });

  it('rejects dates out of order', async () => {
    await http()
      .post('/cohorts')
      .set(auth(creator))
      .send({
        courseId,
        name: 'Backwards',
        startsAt: inDays(30),
        enrollmentClosesAt: inDays(90),
        endsAt: inDays(60),
      })
      .expect(400);
  });

  it('refuses to schedule a module from another program', async () => {
    const other = await seedCourse(app, otherCreator.id, 1);
    await http()
      .put(`/cohorts/${cohortId}/modules`)
      .set(auth(creator))
      .send({ modules: [{ moduleId: other.moduleId, startsAt: inDays(30) }] })
      .expect(400);
  });

  it('will not submit until every module has a date', async () => {
    const response = await http()
      .post(`/cohorts/${cohortId}/submit`)
      .set(auth(creator))
      .expect(400);
    expect(response.body.message).toContain('has no start date');
  });

  it('refuses a submission less than 7 days before the start', async () => {
    const soon = await http()
      .post('/cohorts')
      .set(auth(creator))
      .send({ courseId, name: 'Too soon', ...cohortDates(3) })
      .expect(201);
    await http()
      .put(`/cohorts/${soon.body.id}/modules`)
      .set(auth(creator))
      .send({ modules: [{ moduleId, startsAt: inDays(3) }] })
      .expect(200);
    const response = await http()
      .post(`/cohorts/${soon.body.id}/submit`)
      .set(auth(creator))
      .expect(400);
    expect(response.body.message).toContain('at least 7 days');
  });

  it('submits a complete cohort and tells the admins', async () => {
    await http()
      .put(`/cohorts/${cohortId}/modules`)
      .set(auth(creator))
      .send({ modules: [{ moduleId, startsAt: inDays(30) }] })
      .expect(200);
    await http()
      .post(`/cohorts/${cohortId}/submit`)
      .set(auth(creator))
      .expect(201);

    const notification = await prisma.notification.findFirst({
      where: { userId: admin.id, type: 'cohort-review' },
    });
    expect(notification?.link).toBe(`/admin/cohorts/${cohortId}/review`);
  });

  it('lists it in the admin queue with the program for review', async () => {
    const queue = await http()
      .get('/admin/cohorts')
      .set(auth(admin))
      .expect(200);
    expect(queue.body.map((cohort: { id: string }) => cohort.id)).toContain(
      cohortId,
    );

    const detail = await http()
      .get(`/admin/cohorts/${cohortId}`)
      .set(auth(admin))
      .expect(200);
    expect(detail.body.course.modules[0].lessons).toHaveLength(1);

    await http().get('/admin/cohorts').set(auth(creator)).expect(403);
  });

  it('locks the cohort and the program content while in review', async () => {
    await http()
      .patch(`/admin/cohorts/${cohortId}/start-review`)
      .set(auth(admin))
      .expect(200);
    await http()
      .patch(`/admin/cohorts/${cohortId}/start-review`)
      .set(auth(admin))
      .expect(400);

    await http()
      .patch(`/cohorts/${cohortId}`)
      .set(auth(creator))
      .send({ name: 'Renamed' })
      .expect(403);
    const locked = await http()
      .patch(`/modules/${moduleId}`)
      .set(auth(creator))
      .send({ title: 'Changed during review' })
      .expect(403);
    expect(locked.body.message).toContain('being reviewed');
  });

  it('requires a reason to request changes, then lets the creator edit', async () => {
    await http()
      .patch(`/admin/cohorts/${cohortId}/review`)
      .set(auth(admin))
      .send({ approved: false })
      .expect(400);
    const response = await http()
      .patch(`/admin/cohorts/${cohortId}/review`)
      .set(auth(admin))
      .send({ approved: false, reason: 'Start a week later.' })
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'CHANGES_REQUESTED',
      reviewNote: 'Start a week later.',
    });

    await http()
      .patch(`/cohorts/${cohortId}`)
      .set(auth(creator))
      .send(cohortDates(37))
      .expect(200);
    await http()
      .put(`/cohorts/${cohortId}/modules`)
      .set(auth(creator))
      .send({ modules: [{ moduleId, startsAt: inDays(37) }] })
      .expect(200);
    await http()
      .post(`/cohorts/${cohortId}/submit`)
      .set(auth(creator))
      .expect(201);
  });

  it('approves it, puts it on sale, and keeps the content frozen', async () => {
    await http()
      .patch(`/admin/cohorts/${cohortId}/start-review`)
      .set(auth(admin))
      .expect(200);
    await http()
      .patch(`/admin/cohorts/${cohortId}/review`)
      .set(auth(admin))
      .send({ approved: true })
      .expect(200);

    const onSale = await http().get(`/cohorts/course/${courseId}`).expect(200);
    expect(onSale.body).toEqual([
      expect.objectContaining({
        id: cohortId,
        phase: 'OPEN',
        seatsLeft: 30,
      }),
    ]);

    const locked = await http()
      .patch(`/modules/${moduleId}`)
      .set(auth(creator))
      .send({ title: 'Changed while approved' })
      .expect(403);
    expect(locked.body.message).toContain('approved or running');
    await http()
      .patch(`/modules/${moduleId}`)
      .set(auth(admin))
      .send({ title: 'Admin fix' })
      .expect(200);
  });

  it('sells an ended cohort as a rewatch with no seat cap', async () => {
    const ended = await prisma.cohort.create({
      data: {
        courseId,
        name: 'Past run',
        startsAt: new Date(Date.now() - 90 * DAY_MS),
        enrollmentClosesAt: new Date(Date.now() - 80 * DAY_MS),
        endsAt: new Date(Date.now() - DAY_MS),
        seatCap: 1,
        status: CohortStatus.APPROVED,
      },
    });
    const onSale = await http().get(`/cohorts/course/${courseId}`).expect(200);
    expect(onSale.body).toContainEqual(
      expect.objectContaining({
        id: ended.id,
        phase: 'REWATCH',
        seatsLeft: null,
      }),
    );
  });

  it('only cancels cohorts nobody has joined', async () => {
    const learner = await seedUser(app, 'cohort-learner', UserRole.USER);
    await prisma.enrollment.create({
      data: {
        userId: learner.id,
        courseId,
        cohortId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    await http()
      .post(`/cohorts/${cohortId}/cancel`)
      .set(auth(creator))
      .expect(409);

    const owned = await http()
      .get(`/cohorts/course/${courseId}/manage`)
      .set(auth(creator))
      .expect(200);
    expect(
      owned.body.find((cohort: { id: string }) => cohort.id === cohortId),
    ).toMatchObject({ seatsTaken: 1 });
  });

  describe('checkout, sessions, roster and transfer', () => {
    let saleCourseId: string;
    let openCohortId: string;
    let otherCohortId: string;

    const makeCohort = (data: {
      name: string;
      startsInDays: number;
      closesInDays: number;
      endsInDays: number;
      seatCap?: number;
    }) =>
      prisma.cohort.create({
        data: {
          courseId: saleCourseId,
          name: data.name,
          startsAt: new Date(Date.now() + data.startsInDays * DAY_MS),
          enrollmentClosesAt: new Date(Date.now() + data.closesInDays * DAY_MS),
          endsAt: new Date(Date.now() + data.endsInDays * DAY_MS),
          seatCap: data.seatCap ?? 30,
          status: CohortStatus.APPROVED,
        },
      });

    const buyer = async (label: string) => {
      const user = await seedUser(app, label, UserRole.USER);
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: 10_000 },
      });
      return user;
    };

    const buy = (user: SeededUser, cohort?: string) =>
      http()
        .post('/enrollments/purchase')
        .set(auth(user))
        .send({
          courseId: saleCourseId,
          type: 'FULL_COURSE',
          cohortId: cohort,
        });

    beforeAll(async () => {
      saleCourseId = (await seedCourse(app, creator.id, 1)).id;
      openCohortId = (
        await makeCohort({
          name: 'Open',
          startsInDays: 14,
          closesInDays: 21,
          endsInDays: 60,
          seatCap: 1,
        })
      ).id;
      otherCohortId = (
        await makeCohort({
          name: 'Later',
          startsInDays: 90,
          closesInDays: 97,
          endsInDays: 150,
        })
      ).id;
    });

    it('needs a cohort for a first purchase', async () => {
      const response = await buy(await buyer('no-cohort')).expect(400);
      expect(response.body.message).toBe('Pick a cohort to join.');
    });

    it('takes a seat, then refuses the next buyer once full', async () => {
      const first = await buy(await buyer('first-seat'), openCohortId).expect(
        201,
      );
      expect(first.body.cohortId).toBe(openCohortId);
      const full = await buy(await buyer('too-late'), openCohortId).expect(409);
      expect(full.body.message).toBe('This cohort is full.');
    });

    it('refuses new seats once enrollment has closed, until it ends', async () => {
      const running = await makeCohort({
        name: 'Running',
        startsInDays: -10,
        closesInDays: -3,
        endsInDays: 30,
      });
      const response = await buy(await buyer('closed'), running.id).expect(400);
      expect(response.body.message).toContain('reopens as a rewatch');
    });

    it('sells an ended cohort as a rewatch past its seat cap', async () => {
      const ended = await makeCohort({
        name: 'Ended',
        startsInDays: -90,
        closesInDays: -80,
        endsInDays: -1,
        seatCap: 1,
      });
      await buy(await buyer('rewatch-1'), ended.id).expect(201);
      await buy(await buyer('rewatch-2'), ended.id).expect(201);
    });

    it('keeps live sessions to their own cohort, with recordings', async () => {
      await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Kickoff',
          type: 'Lecture',
          platform: 'Zoom',
          scheduledAt: inDays(15),
          durationMins: 60,
          courseId: saleCourseId,
          meetingLink: 'https://zoom.us/j/1',
        })
        .expect(400);

      const created = await http()
        .post('/live-sessions')
        .set(auth(creator))
        .send({
          title: 'Kickoff',
          type: 'Lecture',
          platform: 'Zoom',
          scheduledAt: inDays(15),
          durationMins: 60,
          courseId: saleCourseId,
          cohortId: otherCohortId,
          meetingLink: 'https://zoom.us/j/1',
        })
        .expect(201);
      const sessionId = created.body.session.id;
      await http()
        .patch(`/live-sessions/${sessionId}`)
        .set(auth(creator))
        .send({ recordingUrl: 'https://youtu.be/replay' })
        .expect(200);

      const outsider = await prisma.enrollment.findFirstOrThrow({
        where: { courseId: saleCourseId, cohortId: openCohortId },
        select: { userId: true },
      });
      const outsiderUser = await prisma.user.findUniqueOrThrow({
        where: { id: outsider.userId },
      });
      const token = await app
        .get(JwtService)
        .signAsync(
          {
            sub: outsiderUser.id,
            email: outsiderUser.email,
            role: outsiderUser.role,
          },
          { secret: process.env.JWT_SECRET, expiresIn: '15m' },
        );
      const header = { Authorization: `Bearer ${token}` };
      await http()
        .post(`/live-sessions/${sessionId}/register`)
        .set(header)
        .expect(403);
      const mine = await http()
        .get(`/live-sessions/course/${saleCourseId}/cohort`)
        .set(header)
        .expect(200);
      expect(mine.body.sessions).toEqual([]);

      const publicList = await http()
        .get('/live-sessions')
        .query({ courseId: saleCourseId })
        .expect(200);
      expect(publicList.body.sessions[0].recordingUrl).toBeUndefined();
    });

    it('shows the roster and lets an admin move a learner', async () => {
      const roster = await http()
        .get(`/cohorts/${openCohortId}/roster`)
        .set(auth(creator))
        .expect(200);
      expect(roster.body.learners).toHaveLength(1);
      const enrollmentId = roster.body.learners[0].id;

      await http()
        .patch(`/admin/cohorts/enrollments/${enrollmentId}/transfer`)
        .set(auth(creator))
        .send({ cohortId: otherCohortId })
        .expect(403);
      await http()
        .patch(`/admin/cohorts/enrollments/${enrollmentId}/transfer`)
        .set(auth(admin))
        .send({ cohortId: otherCohortId })
        .expect(200);
      const moved = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
      expect(moved.cohortId).toBe(otherCohortId);
    });
  });

  it('puts the program live when a cohort is approved', async () => {
    const course = await prisma.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    expect(course.status).toBe(CourseStatus.ACTIVE);
  });
});
