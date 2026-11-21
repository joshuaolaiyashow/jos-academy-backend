import { createServer, type Server } from 'node:http';

import { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
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
      'students',
      'campaigns',
      'assessment',
      'audit-log',
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
        code: 'WSKC10',
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

    const read = await http()
      .get(`/workspace/admin/campaigns/${created.body.data.id}`)
      .set(auth(admin))
      .expect(200);
    expect(read.body.data.redemptionCount).toBe(0);
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
});
