import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';

import { AUDIT_ACTIONS } from '../src/audit/audit-actions';
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

const PASSWORD = 'Correct-Horse-9';

type AuditEntryBody = {
  action: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
};

describe('Audit log (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let creator: SeededUser;

  const http = () => request(app.getHttpServer());

  const latestEntry = (action: string, targetId: string) =>
    prisma.auditLog.findFirstOrThrow({
      where: { action, targetId },
      orderBy: { createdAt: 'desc' },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    admin = await seedUser(app, 'audit-admin', UserRole.ADMIN);
    creator = await seedUser(app, 'audit-creator', UserRole.INSTRUCTOR);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('sign-in', () => {
    let userId: string;
    let email: string;

    beforeAll(async () => {
      email = `audit-learner-${Date.now()}@e2e.test`;
      ({ id: userId } = await prisma.user.create({
        data: {
          email,
          name: 'Audit Learner',
          password: await bcrypt.hash(PASSWORD, 4),
          isEmailVerified: true,
        },
      }));
    });

    it('records a failed sign-in with the reason but never the email', async () => {
      await http()
        .post('/auth/sign-in')
        .send({ email, password: 'wrong-password-1' })
        .expect(401);

      const entry = await latestEntry(
        AUDIT_ACTIONS.AUTH_SIGN_IN_FAILED,
        userId,
      );
      expect(entry).toMatchObject({
        actorId: userId,
        metadata: { reason: 'wrong_password' },
      });
      expect(JSON.stringify(entry)).not.toContain(email);
    });

    it('records a successful sign-in with the actor and user agent', async () => {
      await http()
        .post('/auth/sign-in')
        .set('User-Agent', 'AuditTest/1.0')
        .send({ email, password: PASSWORD })
        .expect(201);

      const entry = await latestEntry(AUDIT_ACTIONS.AUTH_SIGN_IN, userId);
      expect(entry).toMatchObject({
        actorId: userId,
        actorRole: UserRole.USER,
        userAgent: 'AuditTest/1.0',
      });
    });
  });

  describe('program review', () => {
    it('records who rejected a program and why', async () => {
      const { id: courseId } = await seedCourse(
        app,
        creator.id,
        1,
        CourseStatus.PENDING_REVIEW,
      );
      await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(admin))
        .expect(200);
      await http()
        .patch(`/admin/programs/${courseId}/review`)
        .set(auth(admin))
        .send({ status: 'REJECTED', reason: 'Audio is muffled' })
        .expect(200);

      const actions = await prisma.auditLog.findMany({
        where: { targetId: courseId },
        orderBy: { createdAt: 'asc' },
        select: { action: true, actorId: true, metadata: true },
      });
      expect(actions).toEqual([
        {
          action: AUDIT_ACTIONS.COURSE_REVIEW_STARTED,
          actorId: admin.id,
          metadata: null,
        },
        {
          action: AUDIT_ACTIONS.COURSE_REJECTED,
          actorId: admin.id,
          metadata: { reason: 'Audio is muffled', attachmentsCount: 0 },
        },
      ]);
    });
  });

  describe('reading the log', () => {
    it('is admin-only', async () => {
      await http().get('/admin/audit-logs').set(auth(creator)).expect(403);
    });

    it('filters by target and names the actor', async () => {
      const { id: courseId } = await seedCourse(
        app,
        creator.id,
        1,
        CourseStatus.PENDING_REVIEW,
      );
      await http()
        .patch(`/admin/programs/${courseId}/start-review`)
        .set(auth(admin))
        .expect(200);

      const response = await http()
        .get('/admin/audit-logs')
        .query({ targetType: 'course', targetId: courseId })
        .set(auth(admin))
        .expect(200);
      const body = response.body as {
        total: number;
        entries: AuditEntryBody[];
      };
      expect(body.total).toBe(1);
      expect(body.entries[0]).toMatchObject({
        action: AUDIT_ACTIONS.COURSE_REVIEW_STARTED,
        actorId: admin.id,
        actorName: 'audit-admin User',
      });
    });

    it('rejects an unknown action filter', async () => {
      await http()
        .get('/admin/audit-logs')
        .query({ action: 'course.hacked' })
        .set(auth(admin))
        .expect(400);
    });
  });
});
