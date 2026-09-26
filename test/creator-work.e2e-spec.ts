import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import {
  CourseStatus,
  CreditTransactionType,
  EnrollmentStatus,
  EnrollmentType,
  UserRole,
} from '../src/generated/prisma/client';
import { FileUploadService } from '../src/file-upload/file-upload.service';
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

/** Stands in for S3 so file answers can be exercised without AWS. */
const uploadOptions: Array<{ asAttachment?: boolean } | undefined> = [];

const fakeFileUpload = {
  uploadFile: (
    file: Express.Multer.File,
    folder: string,
    options?: { asAttachment?: boolean },
  ) => {
    uploadOptions.push(options);
    return Promise.resolve({
      url: `https://bucket.test/${folder}/${file.originalname}`,
      key: `${folder}/${file.originalname}`,
      bucket: 'bucket',
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  },
  getPresignedUrl: (key: string) =>
    Promise.resolve(`https://signed.test/${key}`),
};

describe('Creator assignments, projects and earnings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creator: SeededUser;
  let otherCreator: SeededUser;
  let learner: SeededUser;
  let secondLearner: SeededUser;
  let outsider: SeededUser;
  let courseId: string;
  let moduleId: string;
  let otherModuleId: string;
  let lessonId: string;

  const http = () => request(app.getHttpServer());

  const questions = [
    {
      id: 'q1',
      question: 'Name the two I2C lines',
      responseType: 'Short response',
    },
    {
      id: 'q2',
      question: 'Pick the SPI clock pin',
      responseType: 'Multiple choice',
      options: ['SCK', 'MISO'],
    },
    {
      id: 'q3',
      question: 'Upload your wiring diagram',
      responseType: 'File upload',
    },
  ];

  beforeAll(async () => {
    app = await createE2eApp([
      { token: FileUploadService, value: fakeFileUpload },
    ]);
    prisma = app.get(PrismaService);

    creator = await seedUser(app, 'creator', UserRole.INSTRUCTOR);
    otherCreator = await seedUser(app, 'other-creator', UserRole.INSTRUCTOR);
    learner = await seedUser(app, 'learner', UserRole.USER);
    secondLearner = await seedUser(app, 'second-learner', UserRole.USER);
    outsider = await seedUser(app, 'outsider', UserRole.USER);

    const course = await seedCourse(app, creator.id, 1, CourseStatus.DRAFT);
    courseId = course.id;
    moduleId = course.moduleId;
    lessonId = course.lessonIds[0];
    otherModuleId = (
      await seedCourse(app, otherCreator.id, 1, CourseStatus.DRAFT)
    ).moduleId;

    for (const user of [learner, secondLearner]) {
      await prisma.enrollment.create({
        data: {
          userId: user.id,
          courseId,
          type: EnrollmentType.FULL_COURSE,
          status: EnrollmentStatus.ACTIVE,
        },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('assignments', () => {
    let assignmentId: string;
    let submissionId: string;

    it("refuses to create an assignment on someone else's module", async () => {
      await http()
        .post('/assignments')
        .set(auth(creator))
        .send({
          moduleId: otherModuleId,
          title: 'Hijack',
          description: 'Not my module',
          maxScore: 100,
          questions,
        })
        .expect(403);
    });

    it('rejects a multiple-choice question without options', async () => {
      await http()
        .post('/assignments')
        .set(auth(creator))
        .send({
          moduleId,
          title: 'Bad quiz',
          description: 'Missing options',
          maxScore: 10,
          questions: [
            { id: 'q1', question: 'Pick one', responseType: 'Multiple choice' },
          ],
        })
        .expect(400);
    });

    it('creates a draft that learners cannot see until published', async () => {
      const created = await http()
        .post('/assignments')
        .set(auth(creator))
        .send({
          moduleId,
          title: 'Sensor wiring',
          description: 'Wire an I2C sensor and explain it.',
          maxScore: 100,
          questions,
        })
        .expect(201);
      assignmentId = created.body.id;
      expect(created.body.publishedAt).toBeNull();

      const beforePublish = await http()
        .get(`/assignments/course/${courseId}`)
        .set(auth(learner))
        .expect(200);
      expect(beforePublish.body.assignments).toHaveLength(0);
      await http()
        .get(`/assignments/${assignmentId}`)
        .set(auth(learner))
        .expect(404);

      await http()
        .post(`/assignments/${assignmentId}/publish`)
        .set(auth(otherCreator))
        .expect(403);
      await http()
        .post(`/assignments/${assignmentId}/publish`)
        .set(auth(creator))
        .expect(201);

      const afterPublish = await http()
        .get(`/assignments/course/${courseId}`)
        .set(auth(learner))
        .expect(200);
      expect(afterPublish.body.assignments).toEqual([
        expect.objectContaining({ id: assignmentId, mySubmission: null }),
      ]);
    });

    it('keeps outsiders out of the assignment', async () => {
      await http()
        .get(`/assignments/course/${courseId}`)
        .set(auth(outsider))
        .expect(403);
      await http()
        .get(`/assignments/${assignmentId}`)
        .set(auth(outsider))
        .expect(403);
    });

    it('rejects answer files a browser could execute', async () => {
      await http()
        .post(`/assignments/${assignmentId}/files`)
        .set(auth(learner))
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'evil.html',
          contentType: 'text/html',
        })
        .expect(400);
      await http()
        .post(`/assignments/${assignmentId}/files`)
        .set(auth(learner))
        .attach('file', Buffer.from('<svg/>'), {
          filename: 'evil.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);
    });

    it('stores an uploaded answer file under the learner and assignment', async () => {
      const upload = await http()
        .post(`/assignments/${assignmentId}/files`)
        .set(auth(learner))
        .attach('file', Buffer.from('diagram'), {
          filename: 'wiring.png',
          contentType: 'image/png',
        })
        .expect(201);
      expect(upload.body.fileKey).toBe(
        `assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
      );
      expect(upload.body.fileName).toBe('wiring.png');
      expect(uploadOptions.at(-1)).toEqual({ asAttachment: true });
    });

    it('validates answers against the questions', async () => {
      await http()
        .post(`/assignments/${assignmentId}/submissions`)
        .set(auth(learner))
        .send({ answers: [{ questionId: 'q1', text: 'SDA and SCL' }] })
        .expect(400);

      await http()
        .post(`/assignments/${assignmentId}/submissions`)
        .set(auth(learner))
        .send({
          answers: [
            { questionId: 'q1', text: 'SDA and SCL' },
            { questionId: 'q2', choice: 'Not an option' },
            {
              questionId: 'q3',
              fileKey: `assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
              fileName: 'wiring.png',
            },
          ],
        })
        .expect(400);
    });

    it('refuses a file that belongs to another learner', async () => {
      await http()
        .post(`/assignments/${assignmentId}/submissions`)
        .set(auth(secondLearner))
        .send({
          answers: [
            { questionId: 'q1', text: 'SDA and SCL' },
            { questionId: 'q2', choice: 'SCK' },
            {
              questionId: 'q3',
              fileKey: `assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
              fileName: 'wiring.png',
            },
          ],
        })
        .expect(400);
    });

    it('accepts a complete submission and notifies the creator', async () => {
      const response = await http()
        .post(`/assignments/${assignmentId}/submissions`)
        .set(auth(learner))
        .send({
          answers: [
            { questionId: 'q1', text: 'SDA and SCL' },
            { questionId: 'q2', choice: 'SCK' },
            {
              questionId: 'q3',
              fileKey: `assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
              fileName: 'wiring.png',
            },
          ],
          notes: 'Used a BME280.',
        })
        .expect(201);
      submissionId = response.body.id;
      expect(response.body).toMatchObject({
        status: 'SUBMITTED',
      });

      const notification = await prisma.notification.findFirst({
        where: { userId: creator.id, type: 'assignment-submitted' },
      });
      expect(notification).not.toBeNull();
    });

    it('shows the creator counts and submissions with signed file links', async () => {
      const list = await http()
        .get('/creator-dashboard/assignments')
        .set(auth(creator))
        .expect(200);
      expect(list.body.assignments).toEqual([
        expect.objectContaining({
          id: assignmentId,
          status: 'active',
          submitted: 1,
          graded: 0,
          pending: 1,
          notSubmitted: 1,
        }),
      ]);

      const submissions = await http()
        .get(`/assignments/${assignmentId}/submissions`)
        .set(auth(creator))
        .expect(200);
      expect(submissions.body.submissions[0]).toMatchObject({
        id: submissionId,
        student: { id: learner.id, email: learner.email },
      });
      expect(submissions.body.submissions[0].answers[2]).not.toHaveProperty(
        'fileKey',
      );
      expect(submissions.body.submissions[0].answers[2].fileUrl).toBe(
        `https://signed.test/assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
      );

      await http()
        .get(`/assignments/${assignmentId}/submissions`)
        .set(auth(otherCreator))
        .expect(403);
      await http()
        .get('/creator-dashboard/assignments')
        .set(auth(learner))
        .expect(403);
    });

    it('grades within the max score and notifies the learner', async () => {
      await http()
        .patch(`/assignment-submissions/${submissionId}/grade`)
        .set(auth(creator))
        .send({ score: 101, feedback: 'Too generous' })
        .expect(400);
      await http()
        .patch(`/assignment-submissions/${submissionId}/grade`)
        .set(auth(otherCreator))
        .send({ score: 80, feedback: 'Not mine' })
        .expect(403);

      await http()
        .patch(`/assignment-submissions/${submissionId}/grade`)
        .set(auth(creator))
        .send({ score: 84, feedback: 'Clear diagram.' })
        .expect(200);

      const mine = await http()
        .get(`/assignments/${assignmentId}`)
        .set(auth(learner))
        .expect(200);
      // Submissions are final, so the learner gets a download link but never the raw storage key.
      expect(mine.body.mySubmission.answers[2].fileKey).toBeUndefined();
      expect(mine.body.mySubmission.answers[2].fileUrl).toEqual(
        expect.any(String),
      );
      expect(mine.body.mySubmission).toMatchObject({
        status: 'GRADED',
        score: 84,
        feedback: 'Clear diagram.',
      });

      const notification = await prisma.notification.findFirst({
        where: { userId: learner.id, type: 'assignment-graded' },
      });
      expect(notification).not.toBeNull();
    });

    it('locks a submission once it is graded', async () => {
      await http()
        .post(`/assignments/${assignmentId}/submissions`)
        .set(auth(learner))
        .send({
          answers: [
            { questionId: 'q1', text: 'Changed' },
            { questionId: 'q2', choice: 'SCK' },
            {
              questionId: 'q3',
              fileKey: `assignment-submissions/${assignmentId}/${learner.id}/wiring.png`,
              fileName: 'wiring.png',
            },
          ],
        })
        .expect(409);
    });
  });

  describe('projects', () => {
    let projectId: string;

    it("refuses to create a project on someone else's program", async () => {
      const other = await prisma.course.findFirstOrThrow({
        where: { creatorId: otherCreator.id },
      });
      await http()
        .post('/projects')
        .set(auth(creator))
        .send({
          courseId: other.id,
          title: 'Hijack',
          description: 'Not my program',
          milestones: ['One'],
        })
        .expect(403);
    });

    it('creates a project', async () => {
      const created = await http()
        .post('/projects')
        .set(auth(creator))
        .send({
          courseId,
          title: 'Line-following robot',
          description: 'Build a robot that follows a line.',
          milestones: ['Design doc', 'Prototype', 'Final build'],
        })
        .expect(201);
      projectId = created.body.id;
    });

    it('makes learners submit milestones in order with https links', async () => {
      const list = await http()
        .get(`/projects/course/${courseId}`)
        .set(auth(learner))
        .expect(200);
      expect(list.body.projects[0]).toMatchObject({
        id: projectId,
        milestones: ['Design doc', 'Prototype', 'Final build'],
        mySubmissions: [],
      });
      // Demo day comes from the learner's cohort; this learner joined before cohorts.
      expect(list.body.demoDay).toBeNull();

      await http()
        .post(`/projects/${projectId}/milestones/1`)
        .set(auth(learner))
        .send({ url: 'https://github.com/ada/robot' })
        .expect(409);
      await http()
        .post(`/projects/${projectId}/milestones/0`)
        .set(auth(learner))
        .send({ url: 'javascript:alert(1)' })
        .expect(400);
      await http()
        .post(`/projects/${projectId}/milestones/3`)
        .set(auth(learner))
        .send({ url: 'https://github.com/ada/robot' })
        .expect(400);

      await http()
        .post(`/projects/${projectId}/milestones/0`)
        .set(auth(learner))
        .send({ url: 'https://docs.google.com/ada-design', notes: 'v1' })
        .expect(201);
      await http()
        .post(`/projects/${projectId}/milestones/1`)
        .set(auth(learner))
        .send({ url: 'https://github.com/ada/robot' })
        .expect(201);

      await http()
        .get(`/projects/course/${courseId}`)
        .set(auth(outsider))
        .expect(403);
      await http()
        .post(`/projects/${projectId}/milestones/0`)
        .set(auth(outsider))
        .send({ url: 'https://example.com' })
        .expect(403);
    });

    it('shows the creator real stage progress and submissions', async () => {
      const list = await http()
        .get('/creator-dashboard/projects')
        .set(auth(creator))
        .expect(200);
      expect(list.body.projects[0]).toMatchObject({
        id: projectId,
        totalSubmissions: 2,
        stages: [
          { label: 'Design doc', completedCount: 1, totalCount: 2 },
          { label: 'Prototype', completedCount: 1, totalCount: 2 },
          { label: 'Final build', completedCount: 0, totalCount: 2 },
        ],
      });

      const submissions = await http()
        .get(`/projects/${projectId}/submissions`)
        .set(auth(creator))
        .expect(200);
      expect(submissions.body.submissions).toHaveLength(2);
      await http()
        .get(`/projects/${projectId}/submissions`)
        .set(auth(otherCreator))
        .expect(403);
    });

    it('lets the creator edit and archive the project', async () => {
      await http()
        .patch(`/projects/${projectId}`)
        .set(auth(creator))
        .send({ title: 'Line follower v2', status: 'ARCHIVED' })
        .expect(200);
      const list = await http()
        .get(`/projects/course/${courseId}`)
        .set(auth(learner))
        .expect(200);
      expect(list.body.projects).toHaveLength(0);
    });
  });

  describe('completed programs', () => {
    it('keeps a finished program readable and discussable but closes coursework', async () => {
      const assignment = await prisma.assignments.create({
        data: {
          moduleId,
          title: 'After the finish line',
          description: 'Should be read-only once the program is completed',
          maxScore: 10,
          questions: [
            { id: 'q1', question: 'Why?', responseType: 'Long response' },
          ],
          publishedAt: new Date(),
        },
      });
      const project = await prisma.courseProject.create({
        data: {
          courseId,
          title: 'Capstone',
          description: 'Closed for graduates',
          milestones: ['Design doc'],
        },
      });
      const graduate = await seedUser(app, 'graduate', UserRole.USER);
      await prisma.enrollment.create({
        data: {
          userId: graduate.id,
          courseId,
          type: EnrollmentType.FULL_COURSE,
          status: EnrollmentStatus.COMPLETED,
        },
      });

      try {
        const detail = await http()
          .get(`/assignments/${assignment.id}`)
          .set(auth(graduate))
          .expect(200);
        expect(detail.body.isReadOnly).toBe(true);
        const assignmentList = await http()
          .get(`/assignments/course/${courseId}`)
          .set(auth(graduate))
          .expect(200);
        expect(assignmentList.body.isReadOnly).toBe(true);

        const refused = await http()
          .post(`/assignments/${assignment.id}/submissions`)
          .set(auth(graduate))
          .send({ answers: [{ questionId: 'q1', text: 'Again.' }] })
          .expect(409);
        expect(refused.body.message).toMatch(/completed this program/);
        await http()
          .post(`/assignments/${assignment.id}/files`)
          .set(auth(graduate))
          .attach('file', Buffer.from('notes'), {
            filename: 'notes.txt',
            contentType: 'text/plain',
          })
          .expect(409);

        const projects = await http()
          .get(`/projects/course/${courseId}`)
          .set(auth(graduate))
          .expect(200);
        expect(projects.body.isReadOnly).toBe(true);
        expect(
          projects.body.projects.map((p: { id: string }) => p.id),
        ).toContain(project.id);
        await http()
          .post(`/projects/${project.id}/milestones/0`)
          .set(auth(graduate))
          .send({ url: 'https://github.com/grad/capstone' })
          .expect(409);

        const thread = await http()
          .post(`/lessons/${lessonId}/discussions`)
          .set(auth(learner))
          .send({ body: 'How did everyone wire the sensor?' })
          .expect(201);
        await http()
          .post(`/lessons/${lessonId}/discussions`)
          .set(auth(graduate))
          .send({
            body: 'Pull-up resistors on both lines.',
            parentId: thread.body.id,
          })
          .expect(201);

        const activeDetail = await http()
          .get(`/assignments/${assignment.id}`)
          .set(auth(learner))
          .expect(200);
        expect(activeDetail.body.isReadOnly).toBe(false);
      } finally {
        // Later tests count this program's learners and projects; leave them as they were.
        await prisma.enrollment.delete({
          where: { userId_courseId: { userId: graduate.id, courseId } },
        });
        await prisma.courseProject.delete({ where: { id: project.id } });
        await prisma.assignments.delete({ where: { id: assignment.id } });
      }
    });
  });

  describe('earnings', () => {
    it('reports gross revenue from real purchases on the creator programs', async () => {
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 15);
      await prisma.creditTransaction.createMany({
        data: [
          {
            userId: learner.id,
            amount: -1000,
            balanceAfter: 0,
            type: CreditTransactionType.COURSE_PURCHASE,
            courseId,
          },
          {
            userId: secondLearner.id,
            amount: -250,
            balanceAfter: 0,
            type: CreditTransactionType.MODULE_PURCHASE,
            courseId,
            moduleId,
          },
          {
            userId: secondLearner.id,
            amount: -400,
            balanceAfter: 0,
            type: CreditTransactionType.COURSE_PURCHASE,
            courseId,
            createdAt: lastMonth,
          },
          {
            userId: learner.id,
            amount: 5000,
            balanceAfter: 5000,
            type: CreditTransactionType.TOP_UP,
          },
        ],
      });

      const response = await http()
        .get('/creator-dashboard/earnings')
        .set(auth(creator))
        .expect(200);
      expect(response.body).toMatchObject({
        currency: 'NGN',
        totalEarnings: 16500,
        earningsThisMonth: 12500,
        earningsLastMonth: 4000,
        breakdown: [
          expect.objectContaining({
            courseId,
            paidStudentsCount: 2,
            totalAmount: 16500,
            amountThisMonth: 12500,
          }),
        ],
      });

      const other = await http()
        .get('/creator-dashboard/earnings')
        .set(auth(otherCreator))
        .expect(200);
      expect(other.body.totalEarnings).toBe(0);
    });
  });

  it('gives admins real per-program stats instead of placeholders', async () => {
    const admin = await seedUser(app, 'admin', UserRole.ADMIN);
    const response = await http()
      .get(`/admin/programs/${courseId}`)
      .set(auth(admin))
      .expect(200);
    expect(response.body.stats).toEqual({
      studentsEnrolled: 2,
      completedCount: 0,
      totalRevenue: 16500,
      sessionsCompleted: 0,
      sessionsTotal: 0,
    });
    expect(response.body.students).toHaveLength(2);
    expect(response.body.project).toBeNull();
    expect(response.body.modules[0].lessons).toHaveLength(1);
  });

  it('lists admin programs as light rows that can be searched by name', async () => {
    const admin = await seedUser(app, 'list-admin', UserRole.ADMIN);
    const { name } = await prisma.course.findUniqueOrThrow({
      where: { id: courseId },
    });
    const response = await http()
      .get('/admin/programs')
      .query({ search: name.toUpperCase(), limit: 5 })
      .set(auth(admin))
      .expect(200);

    expect(response.body).toMatchObject({ page: 1, limit: 5, total: 1 });
    const [row] = response.body.courses;
    expect(row).toMatchObject({
      id: courseId,
      lessonsCount: 1,
      totalRevenue: 16500,
    });
    expect(row.students).toBeUndefined();
    expect(row.modules).toBeUndefined();
  });

  it('refuses an admin programs page larger than the cap', async () => {
    const admin = await seedUser(app, 'cap-admin', UserRole.ADMIN);
    await http()
      .get('/admin/programs')
      .query({ limit: 101 })
      .set(auth(admin))
      .expect(400);
  });

  it('answers 404 for an unknown admin program', async () => {
    const admin = await seedUser(app, 'missing-admin', UserRole.ADMIN);
    await http()
      .get('/admin/programs/00000000-0000-4000-8000-000000000000')
      .set(auth(admin))
      .expect(404);
  });
});
