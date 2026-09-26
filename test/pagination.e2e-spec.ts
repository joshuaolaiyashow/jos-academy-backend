import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { UserRole } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader as auth,
  createE2eApp,
  seedUser,
  type SeededUser,
} from './e2e-helpers';

const NOTIFICATION_COUNT = 5;
const UNREAD_COUNT = 3;

describe('Paginated list endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creator: SeededUser;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    creator = await seedUser(app, 'paging-creator', UserRole.INSTRUCTOR);

    await prisma.notification.createMany({
      data: Array.from({ length: NOTIFICATION_COUNT }, (_, index) => ({
        userId: creator.id,
        title: `Notice ${index}`,
        body: 'Body',
        type: 'GENERAL',
        isRead: index >= UNREAD_COUNT,
        createdAt: new Date(Date.now() - index * 1000),
      })),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('notifications', () => {
    it('pages newest first and reports the unread count across all pages', async () => {
      const first = await http()
        .get('/notifications')
        .query({ limit: 2 })
        .set(auth(creator))
        .expect(200);

      expect(first.body).toMatchObject({
        total: NOTIFICATION_COUNT,
        page: 1,
        limit: 2,
        totalPages: 3,
        hasNextPage: true,
        unreadCount: UNREAD_COUNT,
      });
      expect(
        first.body.notifications.map((n: { title: string }) => n.title),
      ).toEqual(['Notice 0', 'Notice 1']);

      const last = await http()
        .get('/notifications')
        .query({ limit: 2, page: 3 })
        .set(auth(creator))
        .expect(200);
      expect(last.body.hasNextPage).toBe(false);
      expect(last.body.notifications).toHaveLength(1);
    });

    it('counts only unread rows when unreadOnly is set', async () => {
      const response = await http()
        .get('/notifications')
        .query({ unreadOnly: true })
        .set(auth(creator))
        .expect(200);
      expect(response.body.total).toBe(UNREAD_COUNT);
    });

    it('pages the creator-dashboard alias the same way', async () => {
      const response = await http()
        .get('/creator-dashboard/notifications')
        .query({ limit: 1, page: 2 })
        .set(auth(creator))
        .expect(200);
      expect(response.body).toMatchObject({
        total: NOTIFICATION_COUNT,
        page: 2,
        hasNextPage: true,
      });
      expect(response.body.notifications[0].title).toBe('Notice 1');
    });

    it('rejects a zero page', async () => {
      await http()
        .get('/notifications')
        .query({ page: 0 })
        .set(auth(creator))
        .expect(400);
    });
  });
});
