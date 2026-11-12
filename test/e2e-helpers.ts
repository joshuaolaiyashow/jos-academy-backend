import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { CourseStatus, UserRole } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

export type SeededUser = {
  id: string;
  email: string;
  role: UserRole;
  token: string;
};

type ProviderOverride = { token: unknown; value: unknown };

/** Boots the real AppModule with the same global validation as main.ts. */
export const createE2eApp = async (
  overrides: ProviderOverride[] = [],
): Promise<INestApplication<App>> => {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
};

export const authHeader = (user: SeededUser) => ({
  Authorization: `Bearer ${user.token}`,
});

export const seedUser = async (
  app: INestApplication<App>,
  label: string,
  role: UserRole,
): Promise<SeededUser> => {
  const prisma = app.get(PrismaService);
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@e2e.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `${label} User`,
      password: 'not-a-real-hash',
      role,
      isEmailVerified: true,
    },
  });
  const token = await app
    .get(JwtService)
    .signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  return { id: user.id, email, role, token };
};

export const seedCourse = async (
  app: INestApplication<App>,
  ownerId: string,
  lessonCount: number,
  status: CourseStatus = CourseStatus.ACTIVE,
) => {
  const course = await app.get(PrismaService).course.create({
    data: {
      status,
      name: `Robotics Foundations ${Date.now()}`,
      shortDescription: 'Short',
      fullDescription: 'Full',
      duration: 8,
      durationType: 'weeks',
      targetLevel: 'Foundation',
      maxCohortSize: 30,
      tuitionFee: 100_000,
      creatorId: ownerId,
      modules: {
        create: {
          title: 'Module 1',
          description: 'Intro',
          lessonsCount: lessonCount,
          lessons: {
            create: Array.from({ length: lessonCount }, (_, index) => ({
              title: `Lesson ${index + 1}`,
              contentType: 'note' as const,
              content: 'Body',
              order: index,
            })),
          },
        },
      },
    },
    include: { modules: { include: { lessons: true } } },
  });
  return {
    id: course.id,
    moduleId: course.modules[0].id,
    lessonIds: course.modules[0].lessons
      .sort((a, b) => a.order - b.order)
      .map((lesson) => lesson.id),
  };
};
