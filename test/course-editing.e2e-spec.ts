import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  CourseStatus,
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

const DAY_MS = 24 * 60 * 60 * 1000;

const noteLesson = (moduleId: string, title: string) => ({
  moduleId,
  title,
  contentType: 'note',
  content: 'Body',
});

describe('Program editing and the review lock (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let creator: SeededUser;
  let otherCreator: SeededUser;

  const http = () => request(app.getHttpServer());

  const setStatus = (id: string, status: CourseStatus) =>
    prisma.course.update({ where: { id }, data: { status } });

  const moduleTitles = async (courseId: string): Promise<string[]> => {
    const response = await http().get(`/course/${courseId}`).expect(200);
    return response.body.modules.map(
      (module: { title: string }) => module.title,
    );
  };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    admin = await seedUser(app, 'edit-admin', UserRole.ADMIN);
    creator = await seedUser(app, 'edit-creator', UserRole.INSTRUCTOR);
    otherCreator = await seedUser(app, 'edit-other', UserRole.INSTRUCTOR);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('modules', () => {
    let courseId: string;
    let firstModuleId: string;
    let secondModuleId: string;

    beforeAll(async () => {
      const course = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      courseId = course.id;
      firstModuleId = course.moduleId;
    });

    it('adds a module to the end of a draft program', async () => {
      const response = await http()
        .post(`/course/${courseId}/modules`)
        .set(auth(creator))
        .send({
          title: '  Module 2  ',
          description: 'Actuators',
          lessonsCount: 2,
        })
        .expect(201);
      secondModuleId = response.body.id;
      expect(response.body).toMatchObject({ title: 'Module 2', order: 1 });
    });

    it('refuses a module from someone who does not own the program', async () => {
      await http()
        .post(`/course/${courseId}/modules`)
        .set(auth(otherCreator))
        .send({ title: 'Hijack', description: 'No', lessonsCount: 1 })
        .expect(403);
    });

    it('renames a module', async () => {
      const response = await http()
        .patch(`/modules/${secondModuleId}`)
        .set(auth(creator))
        .send({ title: 'Module 2: Actuators' })
        .expect(200);
      expect(response.body.title).toBe('Module 2: Actuators');
    });

    it('reorders modules and serves them in the new order', async () => {
      await http()
        .put(`/course/${courseId}/modules/order`)
        .set(auth(creator))
        .send({ moduleIds: [secondModuleId, firstModuleId] })
        .expect(200);
      expect(await moduleTitles(courseId)).toEqual([
        'Module 2: Actuators',
        'Module 1',
      ]);
    });

    it('rejects a reorder that leaves a module out', async () => {
      await http()
        .put(`/course/${courseId}/modules/order`)
        .set(auth(creator))
        .send({ moduleIds: [secondModuleId] })
        .expect(400);
    });

    it('refuses to delete a module a learner has unlocked', async () => {
      const learner = await seedUser(app, 'edit-learner', UserRole.USER);
      await prisma.enrollment.create({
        data: {
          userId: learner.id,
          courseId,
          type: EnrollmentType.MODULAR,
          status: EnrollmentStatus.ACTIVE,
          enrolledModules: { create: { moduleId: firstModuleId } },
        },
      });
      await http()
        .delete(`/modules/${firstModuleId}`)
        .set(auth(creator))
        .expect(409);
    });

    it('deletes a module no learner has bought', async () => {
      await http()
        .delete(`/modules/${secondModuleId}`)
        .set(auth(creator))
        .expect(200);
      expect(await moduleTitles(courseId)).toEqual(['Module 1']);
    });
  });

  describe('lessons', () => {
    let moduleId: string;
    let lessonId: string;

    beforeAll(async () => {
      ({ moduleId } = await seedCourse(app, creator.id, 0, CourseStatus.DRAFT));
      await prisma.modules.update({
        where: { id: moduleId },
        data: { lessonsCount: 1 },
      });
    });

    it("refuses a lesson in another creator's module", async () => {
      await http()
        .post('/lessons')
        .set(auth(otherCreator))
        .send(noteLesson(moduleId, 'Injected'))
        .expect(403);
    });

    it('creates and deletes a lesson on a draft program', async () => {
      const created = await http()
        .post('/lessons')
        .set(auth(creator))
        .send(noteLesson(moduleId, 'Wiring'))
        .expect(201);
      lessonId = created.body.lesson.id;

      await http()
        .delete(`/lessons/${lessonId}`)
        .set(auth(otherCreator))
        .expect(403);
      await http()
        .delete(`/lessons/${lessonId}`)
        .set(auth(creator))
        .expect(200);
      expect(
        await prisma.lesson.findUnique({ where: { id: lessonId } }),
      ).toBeNull();
    });

    it("refuses to move a lesson into another program's module", async () => {
      const own = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
      await http()
        .patch(`/lessons/${own.lessonIds[0]}`)
        .set(auth(creator))
        .send({ moduleId })
        .expect(400);
    });
  });

  describe('review lock', () => {
    let courseId: string;
    let moduleId: string;
    let lessonId: string;

    const creatorEdits = [
      () =>
        http()
          .patch(`/course/${courseId}`)
          .set(auth(creator))
          .field('name', 'Renamed'),
      () =>
        http()
          .post(`/course/${courseId}/modules`)
          .set(auth(creator))
          .send({ title: 'Extra', description: 'More', lessonsCount: 1 }),
      () =>
        http()
          .patch(`/modules/${moduleId}`)
          .set(auth(creator))
          .send({ title: 'Renamed' }),
      () =>
        http()
          .put(`/course/${courseId}/modules/order`)
          .set(auth(creator))
          .send({ moduleIds: [moduleId] }),
      () =>
        http()
          .post('/lessons')
          .set(auth(creator))
          .send(noteLesson(moduleId, 'Late lesson')),
      () =>
        http()
          .patch(`/lessons/${lessonId}`)
          .set(auth(creator))
          .send({ title: 'Renamed' }),
      () => http().delete(`/lessons/${lessonId}`).set(auth(creator)),
      () => http().delete(`/modules/${moduleId}`).set(auth(creator)),
    ];

    const expectCreatorLockedOut = async () => {
      for (const [index, attempt] of creatorEdits.entries()) {
        const response = await attempt();
        expect({ index, status: response.status }).toEqual({
          index,
          status: 403,
        });
      }
    };

    beforeAll(async () => {
      const course = await seedCourse(
        app,
        creator.id,
        1,
        CourseStatus.PENDING_REVIEW,
      );
      courseId = course.id;
      moduleId = course.moduleId;
      lessonId = course.lessonIds[0];
    });

    it('keeps a pending program editable and in the queue', async () => {
      await http()
        .patch(`/lessons/${lessonId}`)
        .set(auth(creator))
        .send({ title: 'Fixed typo' })
        .expect(200);
      const course = await prisma.course.findUniqueOrThrow({
        where: { id: courseId },
      });
      expect(course.status).toBe(CourseStatus.PENDING_REVIEW);
    });

    it('will not approve a program whose review has not started', async () => {
      await http()
        .patch(`/admin/programs/${courseId}/review`)
        .set(auth(admin))
        .send({ status: 'ACTIVE' })
        .expect(400);
    });

    it('only lets admins start a review', async () => {
      await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(creator))
        .expect(403);
      const response = await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(admin))
        .expect(200);
      expect(response.body.status).toBe(CourseStatus.IN_REVIEW);

      const notification = await prisma.notification.findFirst({
        where: { userId: creator.id, type: 'program-review' },
        orderBy: { createdAt: 'desc' },
      });
      expect(notification?.body).toContain('Editing is paused');
    });

    it('refuses to start a review twice', async () => {
      await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(admin))
        .expect(400);
    });

    it('locks the creator out of every change while in review', async () => {
      await expectCreatorLockedOut();
    });

    it('unlocks the program when the review requests changes', async () => {
      await http()
        .patch(`/admin/programs/${courseId}/review`)
        .set(auth(admin))
        .send({ status: 'REJECTED', reason: 'Add a lesson' })
        .expect(200);
      await http()
        .patch(`/lessons/${lessonId}`)
        .set(auth(creator))
        .send({ title: 'Reworked' })
        .expect(200);
    });

    it('locks the program for good once it is approved', async () => {
      await setStatus(courseId, CourseStatus.PENDING_REVIEW);
      await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(admin))
        .expect(200);
      await http()
        .patch(`/admin/programs/${courseId}/review`)
        .set(auth(admin))
        .send({ status: 'ACTIVE' })
        .expect(200);

      await expectCreatorLockedOut();
      await http()
        .post(`/course/${courseId}/submit-for-review`)
        .set(auth(creator))
        .expect(400);
    });

    it('still lets the creator add a project to a live program', async () => {
      await http()
        .post('/projects')
        .set(auth(creator))
        .send({
          courseId,
          title: 'Capstone',
          description: 'Build it',
          milestones: ['Plan'],
        })
        .expect(201);
    });

    it('still lets an admin correct a live program', async () => {
      await http()
        .patch(`/lessons/${lessonId}`)
        .set(auth(admin))
        .send({ title: 'Admin fix' })
        .expect(200);
    });
  });
  describe('lesson plan', () => {
    let courseId: string;
    let moduleId: string;
    let lessonIds: string[];

    const setPlannedLessons = (lessonsCount: number) =>
      http()
        .patch(`/modules/${moduleId}`)
        .set(auth(creator))
        .send({ lessonsCount });

    beforeAll(async () => {
      ({
        id: courseId,
        moduleId,
        lessonIds,
      } = await seedCourse(app, creator.id, 2, CourseStatus.DRAFT));
    });

    it('requires a planned lesson count when adding a module', async () => {
      await http()
        .post(`/course/${courseId}/modules`)
        .set(auth(creator))
        .send({ title: 'No plan', description: 'Missing count' })
        .expect(400);
    });

    it('refuses a lesson beyond the planned count until the plan is raised', async () => {
      const refused = await http()
        .post('/lessons')
        .set(auth(creator))
        .send(noteLesson(moduleId, 'One too many'))
        .expect(400);
      expect(refused.body.message).toContain('planned for 2 lessons');

      await setPlannedLessons(3).expect(200);
      await http()
        .post('/lessons')
        .set(auth(creator))
        .send(noteLesson(moduleId, 'Now it fits'))
        .expect(201);
    });

    it('refuses to lower the plan below the lessons already added', async () => {
      const refused = await setPlannedLessons(1).expect(400);
      expect(refused.body.message).toContain('already has 3 lessons');
    });

    it('refuses to move a lesson into a module that is already full', async () => {
      const fullModule = await prisma.modules.create({
        data: {
          courseId,
          title: 'Full module',
          description: 'Planned for zero more',
          lessonsCount: 1,
          order: 1,
          lessons: {
            create: {
              title: 'Only lesson',
              contentType: 'note',
              content: 'Body',
            },
          },
        },
      });
      await http()
        .patch(`/lessons/${lessonIds[0]}`)
        .set(auth(creator))
        .send({ moduleId: fullModule.id })
        .expect(400);
      await prisma.modules.delete({ where: { id: fullModule.id } });
    });

    it('blocks review until every module has exactly its planned lessons', async () => {
      await prisma.course.update({
        where: { id: courseId },
        data: {
          startsAt: new Date(Date.now() + 14 * DAY_MS),
          enrollmentClosesAt: new Date(Date.now() + 21 * DAY_MS),
          endsAt: new Date(Date.now() + 60 * DAY_MS),
        },
      });
      await setPlannedLessons(4).expect(200);
      const refused = await http()
        .post(`/course/${courseId}/submit-for-review`)
        .set(auth(creator))
        .expect(400);
      expect(refused.body.message).toContain('"Module 1": 3 of 4 lessons');

      await setPlannedLessons(3).expect(200);
      await http()
        .post(`/course/${courseId}/submit-for-review`)
        .set(auth(creator))
        .expect(201);
    });
  });
});
