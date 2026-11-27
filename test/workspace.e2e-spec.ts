import { createServer, type Server } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';

import {
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

const JWKS_PORT = 4792;
const KEY_ID = 'test-key';
const KEYCLOAK_SUB = '11111111-1111-4111-8111-111111111111';

let privateKey: KeyLike;
let jwksServer: Server;

const asWorkspace = async (roles: string[], audience = 'academy-api') => ({
  Authorization: `Bearer ${await new SignJWT({
    resource_access: { 'academy-api': { roles } },
  })
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setSubject(KEYCLOAK_SUB)
    .setIssuer(process.env.KEYCLOAK_ISSUER!)
    .setAudience(audience)
    .setExpirationTime('5m')
    .sign(privateKey)}`,
});

describe('JOS Workspace contract (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: SeededUser;
  let creator: SeededUser;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    const jwks = JSON.stringify({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: KEY_ID,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    });
    jwksServer = createServer((_req, res) =>
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(jwks),
    );
    await new Promise<void>((resolve) =>
      jwksServer.listen(JWKS_PORT, '127.0.0.1', resolve),
    );
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jest
      .spyOn(app.get(NotificationService), 'sendEmail')
      .mockResolvedValue({ data: null, error: null } as never);
    admin = await seedUser(app, 'ws-admin', UserRole.ADMIN);
    creator = await seedUser(app, 'ws-creator', UserRole.INSTRUCTOR);
  });

  afterAll(async () => {
    jwksServer.close();
    await app.close();
  });

  it('serves the manifest only to a workspace token', async () => {
    await http().get('/admin/workspace-manifest').expect(401);
    await http().get('/admin/workspace-manifest').set(auth(admin)).expect(401);
    await http()
      .get('/admin/workspace-manifest')
      .set(await asWorkspace([], 'some-other-api'))
      .expect(401);
    const res = await http()
      .get('/admin/workspace-manifest')
      .set(await asWorkspace([]))
      .expect(200);
    expect(res.body.modules.map((m: { key: string }) => m.key)).toEqual([
      'programs',
      'categories',
      'students',
      'creators',
      'campaigns',
      'assessment',
      'audit-log',
    ]);
    expect(
      res.body.audiences.map((a: { key: string; path: string }) => a.path),
    ).toEqual([
      '/workspace/audiences/students',
      '/workspace/audiences/instructors',
    ]);
  });

  it('lets a workspace token act only within its module grants', async () => {
    const viewer = await asWorkspace(['programs:view']);
    await http().get('/workspace/admin/programs').set(viewer).expect(200);
    await http().get('/workspace/admin/students').set(viewer).expect(403);
    await http()
      .post('/workspace/admin/campaigns')
      .set(await asWorkspace(['campaigns:view']))
      .send({})
      .expect(403);
    await http()
      .get('/workspace/admin/audit-log')
      .set(await asWorkspace(['audit-log:view']))
      .expect(200);
  });

  it('records the Keycloak user as creator of a workspace-made campaign', async () => {
    const res = await http()
      .post('/workspace/admin/campaigns')
      .set(await asWorkspace(['campaigns:manage']))
      .send({
        name: 'Workspace campaign',
        code: `WSKC${Date.now()}`,
        percentOff: 10,
        appliesTo: 'ALL',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    const stored = await prisma.discountCampaign.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(stored.createdById).toBe(KEYCLOAK_SUB);
  });

  it('keeps the workspace routes admin-only', async () => {
    await http().get('/workspace/admin/programs').expect(401);
    await http()
      .get('/workspace/admin/programs')
      .set(auth(creator))
      .expect(403);
  });

  it('lists, reads and reviews programs in the contract shape', async () => {
    const course = await seedCourse(
      app,
      creator.id,
      1,
      CourseStatus.PENDING_REVIEW,
    );
    const { name } = await prisma.course.findUniqueOrThrow({
      where: { id: course.id },
    });
    const list = await http()
      .get(
        `/workspace/admin/programs?page=1&limit=5&search=${encodeURIComponent(name)}`,
      )
      .set(auth(admin))
      .expect(200);
    expect(list.body.meta).toEqual({ total: 1, page: 1, limit: 5 });
    expect(list.body.data[0].id).toBe(course.id);

    const read = await http()
      .get(`/workspace/admin/programs/${course.id}`)
      .set(auth(admin))
      .expect(200);
    expect(read.body.data.id).toBe(course.id);

    await http()
      .patch(`/workspace/admin/programs/${course.id}/start-review`)
      .set(auth(admin))
      .expect(200);
    const reviewed = await http()
      .patch(`/workspace/admin/programs/${course.id}`)
      .set(auth(admin))
      .send({ status: 'REJECTED', rejectionReason: 'Module 1 has no audio.' })
      .expect(200);
    expect(reviewed.body.data.status).toBe(CourseStatus.REJECTED);
  });

  it('filters, sorts and counts programs for the status tabs', async () => {
    const course = await seedCourse(
      app,
      creator.id,
      1,
      CourseStatus.PENDING_REVIEW,
    );
    const { name } = await prisma.course.findUniqueOrThrow({
      where: { id: course.id },
    });
    const search = `search=${encodeURIComponent(name)}`;
    const matching = await http()
      .get(
        `/workspace/admin/programs?status=PENDING_REVIEW&targetLevel=Foundation&${search}`,
      )
      .set(auth(admin))
      .expect(200);
    expect(matching.body.data.map((row: { id: string }) => row.id)).toEqual([
      course.id,
    ]);
    const otherStatus = await http()
      .get(`/workspace/admin/programs?status=ACTIVE&${search}`)
      .set(auth(admin))
      .expect(200);
    expect(otherStatus.body.meta.total).toBe(0);

    const sorted = await http()
      .get('/workspace/admin/programs?sort=tuitionFee&order=desc&limit=100')
      .set(auth(admin))
      .expect(200);
    const fees = sorted.body.data.map(
      (row: { tuitionFee: number }) => row.tuitionFee,
    );
    expect(fees).toEqual([...fees].sort((a, b) => b - a));
    await http()
      .get('/workspace/admin/programs?sort=rating')
      .set(auth(admin))
      .expect(400);
    await http()
      .get('/workspace/admin/programs?status=LIVE')
      .set(auth(admin))
      .expect(400);

    const counts = await http()
      .get('/workspace/admin/programs/counts')
      .set(await asWorkspace(['programs:view']))
      .expect(200);
    expect(counts.body.data[CourseStatus.PENDING_REVIEW]).toBe(
      await prisma.course.count({
        where: { status: CourseStatus.PENDING_REVIEW },
      }),
    );
  });

  it('creates an inactive campaign and pages campaigns with search', async () => {
    const code = `WS${Date.now()}`;
    const created = await http()
      .post('/workspace/admin/campaigns')
      .set(auth(admin))
      .send({
        name: 'Workspace launch',
        code,
        percentOff: 10,
        appliesTo: 'ALL',
        startsAt: '2026-12-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
        isActive: false,
      })
      .expect(201);
    expect(created.body.data.isActive).toBe(false);

    const list = await http()
      .get(
        `/workspace/admin/campaigns?page=1&limit=10&search=${code.toLowerCase()}`,
      )
      .set(auth(admin))
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].code).toBe(code);

    for (const [isActive, total] of [
      ['false', 1],
      ['true', 0],
    ] as const) {
      const filtered = await http()
        .get(`/workspace/admin/campaigns?isActive=${isActive}&search=${code}`)
        .set(auth(admin))
        .expect(200);
      expect(filtered.body.meta.total).toBe(total);
    }
    const byStart = await http()
      .get('/workspace/admin/campaigns?sort=startsAt&order=desc&limit=100')
      .set(auth(admin))
      .expect(200);
    const starts = byStart.body.data.map((row: { startsAt: string }) =>
      Date.parse(row.startsAt),
    );
    expect(starts).toEqual([...starts].sort((a, b) => b - a));

    const read = await http()
      .get(`/workspace/admin/campaigns/${created.body.data.id}`)
      .set(auth(admin))
      .expect(200);
    expect(read.body.data.redemptionCount).toBe(0);
  });

  it('round-trips quiz answers as plain text, keeping ids by position', async () => {
    const manager = await asWorkspace(['assessment:manage']);
    const created = await http()
      .post('/workspace/admin/assessment')
      .set(manager)
      .send({
        subject: 'maths',
        prompt: 'What is 12 + 27?',
        options: ['39', '40'],
      })
      .expect(201);
    expect(created.body.data.options).toEqual(['39', '40']);
    const stored = await prisma.assessmentQuestion.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.options).toEqual([
      { id: 'a', label: '39' },
      { id: 'b', label: '40' },
    ]);

    const updated = await http()
      .patch(`/workspace/admin/assessment/${created.body.data.id}`)
      .set(manager)
      .send({ options: ['39', '40', '41'] })
      .expect(200);
    expect(updated.body.data.options).toEqual(['39', '40', '41']);

    await http()
      .post('/workspace/admin/assessment')
      .set(manager)
      .send({ subject: 'maths', prompt: 'One answer?', options: ['only'] })
      .expect(400);
  });

  it('serves a student record and its related tabs with the view grant only', async () => {
    const student = await seedUser(app, 'ws-tabs-student', UserRole.USER);
    const viewer = await asWorkspace(['students:view']);
    const read = await http()
      .get(`/workspace/admin/students/${student.id}`)
      .set(viewer)
      .expect(200);
    expect(read.body.data).toMatchObject({
      id: student.id,
      isSuspended: false,
    });
    for (const tab of ['programs', 'payments', 'rewards']) {
      const res = await http()
        .get(`/workspace/admin/students/${student.id}/${tab}`)
        .set(viewer)
        .expect(200);
      expect(res.body.data).toEqual([]);
    }
    await http()
      .get(`/workspace/admin/students/${creator.id}/payments`)
      .set(viewer)
      .expect(404);
    await http()
      .get(`/workspace/admin/creators/${creator.id}/programs`)
      .set(viewer)
      .expect(403);
  });

  it('suspends a student through a body-less action', async () => {
    const student = await seedUser(app, 'ws-student', UserRole.USER);
    await http()
      .patch(`/workspace/admin/students/${student.id}/suspend`)
      .set(auth(admin))
      .expect(200);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: student.id },
    });
    expect(stored.isSuspended).toBe(true);

    for (const [isSuspended, total] of [
      ['true', 1],
      ['false', 0],
    ] as const) {
      const filtered = await http()
        .get(
          `/workspace/admin/students?isSuspended=${isSuspended}&search=${encodeURIComponent(student.email)}`,
        )
        .set(auth(admin))
        .expect(200);
      expect(filtered.body.meta.total).toBe(total);
    }
    await http()
      .get('/workspace/admin/students?isSuspended=maybe')
      .set(auth(admin))
      .expect(400);
  });

  it('filters creators by suspension in memory', async () => {
    const active = await http()
      .get(
        `/workspace/admin/creators?isSuspended=false&search=${encodeURIComponent(creator.email)}`,
      )
      .set(auth(admin))
      .expect(200);
    expect(active.body.data.map((row: { id: string }) => row.id)).toEqual([
      creator.id,
    ]);
    const suspended = await http()
      .get(
        `/workspace/admin/creators?isSuspended=true&search=${encodeURIComponent(creator.email)}`,
      )
      .set(auth(admin))
      .expect(200);
    expect(suspended.body.meta.total).toBe(0);
  });

  it('accepts the workspace search param on the audit log and answers errors as { message, code }', async () => {
    const audit = await http()
      .get('/workspace/admin/audit-log?page=1&limit=2&search=anything')
      .set(auth(admin))
      .expect(200);
    expect(audit.body.meta).toMatchObject({ page: 1, limit: 2 });

    const missing = await http()
      .get('/workspace/admin/assessment/00000000-0000-4000-8000-000000000000')
      .set(auth(admin))
      .expect(404);
    expect(missing.body).toEqual({
      message: 'Question not found',
      code: 'NOT_FOUND',
    });
  });

  describe('broadcast audiences', () => {
    const tag = `aud${Date.now()}`;
    let exporter: Record<string, string>;
    let programId: string;
    let otherProgramId: string;
    let optedOut: SeededUser;
    let instructor: SeededUser;

    const enrol = async (
      label: string,
      courseId: string,
      status: EnrollmentStatus = EnrollmentStatus.ACTIVE,
    ): Promise<SeededUser> => {
      const user = await seedUser(app, `${tag}-${label}`, UserRole.USER);
      await prisma.enrollment.create({
        data: { userId: user.id, courseId, status },
      });
      return user;
    };
    const students = (params: string) =>
      http().get(`/workspace/audiences/students?${params}`).set(exporter);

    beforeAll(async () => {
      exporter = await asWorkspace(['audiences:export']);
      programId = (await seedCourse(app, creator.id, 1)).id;
      otherProgramId = (await seedCourse(app, creator.id, 1)).id;
      await enrol('a', programId);
      await enrol('b', programId);
      await enrol('c', otherProgramId);
      optedOut = await enrol('opted-out', programId);
      await prisma.user.update({
        where: { id: optedOut.id },
        data: { marketingOptOut: true },
      });
      const suspended = await enrol('suspended', programId);
      await prisma.user.update({
        where: { id: suspended.id },
        data: { isSuspended: true },
      });
      await enrol('unpaid', programId, EnrollmentStatus.PENDING);
      instructor = await seedUser(app, `${tag}-teacher`, UserRole.INSTRUCTOR);
    });

    it('needs a workspace token with audiences:export and nothing else', async () => {
      await http().get('/workspace/audiences/students').expect(401);
      await http()
        .get('/workspace/audiences/students')
        .set(auth(admin))
        .expect(401);
      const denied = await http()
        .get('/workspace/audiences/instructors')
        .set(await asWorkspace(['students:manage', 'programs:manage']))
        .expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');
      await http()
        .post('/workspace/audiences/students/unsubscribe')
        .set(await asWorkspace(['students:manage']))
        .send({ email: optedOut.email })
        .expect(403);
    });

    it('pages enrolled, opted-in students by cursor with a total', async () => {
      const first = await students(`search=${tag}&limit=2`).expect(200);
      expect(first.body.meta.total).toBe(3);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta.nextCursor).toEqual(expect.any(String));
      const second = await students(
        `search=${tag}&limit=2&cursor=${first.body.meta.nextCursor}`,
      ).expect(200);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.meta).toEqual({ nextCursor: null, total: 3 });
      const emails = [...first.body.data, ...second.body.data].map(
        (member: { email: string }) => member.email,
      );
      expect(new Set(emails).size).toBe(3);
      expect(emails).not.toContain(optedOut.email);
      expect(first.body.data[0]).toEqual({
        email: expect.any(String),
        name: expect.any(String),
      });
    });

    it('searches case-insensitively and matches wildcards literally', async () => {
      const upper = await students(`search=${tag.toUpperCase()}`).expect(200);
      expect(upper.body.meta.total).toBe(3);
      const literal = await students(
        `search=${encodeURIComponent(`${tag}%`)}`,
      ).expect(200);
      expect(literal.body.meta.total).toBe(0);
    });

    it('filters students by program and refuses an unknown one', async () => {
      const cohort = await students(
        `search=${tag}&program=${otherProgramId}`,
      ).expect(200);
      expect(cohort.body.meta.total).toBe(1);
      expect(cohort.body.data[0].email).toContain(`${tag}-c-`);
      const unknown = await students(
        'program=00000000-0000-4000-8000-000000000000',
      ).expect(400);
      expect(unknown.body.code).toBe('VALIDATION_FAILED');
    });

    it('lists instructors only, without a program filter', async () => {
      const res = await http()
        .get(`/workspace/audiences/instructors?search=${tag}`)
        .set(exporter)
        .expect(200);
      expect(res.body.data).toEqual([
        { email: instructor.email, name: `${tag}-teacher User` },
      ]);
      await http()
        .get(`/workspace/audiences/instructors?program=${programId}`)
        .set(exporter)
        .expect(400);
    });

    it('includes opted-out users only when asked to', async () => {
      const all = await students(`search=${tag}&includeOptedOut=true`).expect(
        200,
      );
      expect(all.body.meta.total).toBe(4);
      expect(
        all.body.data.map((member: { email: string }) => member.email),
      ).toContain(optedOut.email);
    });

    it('unsubscribes idempotently and says so for unknown emails', async () => {
      const target = await enrol('leaver', programId);
      const unsubscribe = (email: string) =>
        http()
          .post('/workspace/audiences/students/unsubscribe')
          .set(exporter)
          .send({ email })
          .expect(200);

      const first = await unsubscribe(target.email.toUpperCase());
      expect(first.body.data).toEqual({
        email: target.email.toUpperCase(),
        unsubscribed: true,
      });
      const { marketingOptOutAt } = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(marketingOptOutAt).toBeInstanceOf(Date);

      await unsubscribe(target.email);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(after.marketingOptOut).toBe(true);
      expect(after.marketingOptOutAt).toEqual(marketingOptOutAt);

      const unknown = await unsubscribe(`nobody-${tag}@e2e.test`);
      expect(unknown.body.data.unsubscribed).toBe(false);

      const list = await students(`search=${tag}`).expect(200);
      expect(list.body.meta.total).toBe(3);
    });
  });
});
