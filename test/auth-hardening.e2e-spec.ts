import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';

import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './e2e-helpers';

const PASSWORD = 'Correct-Horse-9';
const DAY_S = 24 * 60 * 60;
const MINUTE_MS = 60 * 1000;

type Tokens = { accessToken: string; refreshToken: string };

describe('Refresh token hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  const http = () => request(app.getHttpServer());

  const createUser = async () => {
    const email = `auth-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
    return prisma.user.create({
      data: {
        email,
        name: 'Auth User',
        password: await bcrypt.hash(PASSWORD, 4),
        isEmailVerified: true,
      },
    });
  };

  const signIn = async (email: string, clientType?: 'web' | 'mobile') => {
    const response = await http()
      .post('/auth/sign-in')
      .send({
        email,
        password: PASSWORD,
        ...(clientType ? { clientType } : {}),
      })
      .expect(201);
    return response.body as Tokens;
  };

  const lifetimeDays = (token: string): number => {
    const { exp, iat } = jwt.decode<{ exp: number; iat: number }>(token);
    return Math.round((exp - iat) / DAY_S);
  };

  const refresh = (refreshToken: string) =>
    http().post('/auth/refresh').send({ refreshToken });

  /** Pretends the token was rotated long ago, outside the multi-tab grace window. */
  const ageRevocation = (refreshToken: string) =>
    prisma.refreshToken.updateMany({
      where: {
        userId: jwt.decode<{ sub: string }>(refreshToken).sub,
        revokedAt: { not: null },
      },
      data: { revokedAt: new Date(Date.now() - 5 * MINUTE_MS) },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives web sessions a 7-day refresh token and mobile a 30-day one', async () => {
    const user = await createUser();
    expect(lifetimeDays((await signIn(user.email)).refreshToken)).toBe(7);
    expect(
      lifetimeDays((await signIn(user.email, 'mobile')).refreshToken),
    ).toBe(30);
  });

  it('keeps the client type across rotations', async () => {
    const user = await createUser();
    const { refreshToken } = await signIn(user.email, 'mobile');
    const rotated = await refresh(refreshToken).expect(201);
    expect(lifetimeDays((rotated.body as Tokens).refreshToken)).toBe(30);
  });

  it('rejects an unknown client type', async () => {
    const user = await createUser();
    await http()
      .post('/auth/sign-in')
      .send({ email: user.email, password: PASSWORD, clientType: 'desktop' })
      .expect(400);
  });

  it('treats reuse within the grace window as a harmless tab race', async () => {
    const user = await createUser();
    const { refreshToken } = await signIn(user.email);
    const rotated = (await refresh(refreshToken).expect(201)).body as Tokens;

    const replay = await refresh(refreshToken).expect(401);
    expect(replay.body.code).toBeUndefined();

    await refresh(rotated.refreshToken).expect(201);
  });

  it('revokes every session when a rotated token is reused later', async () => {
    const user = await createUser();
    const otherDevice = await signIn(user.email, 'mobile');
    const { refreshToken } = await signIn(user.email);
    const rotated = (await refresh(refreshToken).expect(201)).body as Tokens;
    await ageRevocation(refreshToken);

    const theft = await refresh(refreshToken).expect(401);
    expect(theft.body.code).toBe('REFRESH_TOKEN_REUSED');

    await refresh(rotated.refreshToken).expect(401);
    await refresh(otherDevice.refreshToken).expect(401);
  });

  it('only lets one of two simultaneous refreshes win', async () => {
    const user = await createUser();
    const { refreshToken } = await signIn(user.email);
    const results = await Promise.all([
      refresh(refreshToken),
      refresh(refreshToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
  });

  it('stops suspended accounts from refreshing and signs them out everywhere', async () => {
    const user = await createUser();
    const { refreshToken } = await signIn(user.email);
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: true },
    });

    const response = await refresh(refreshToken).expect(403);
    expect(response.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(
      await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
  });
});
