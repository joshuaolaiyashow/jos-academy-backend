import 'dotenv/config';
const {
  PrismaClient,
  UserRole,
  DurationType,
  TargetLevel,
  LessonContentType,
  SessionType,
  SessionPlatform,
} = require('../src/generated/prisma/client');
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { SEED_CATEGORIES, SEED_COURSES, SEED_LIVE_SESSIONS } from './seed-data';
import { SEED_ASSESSMENT_QUESTIONS } from './seed-data-assessment';
import {
  EXTRA_CATEGORIES,
  EXTRA_COURSES,
  EXTRA_LESSONS,
  EXTRA_LIVE_SESSIONS,
} from './seed-data-extra';

const ALL_CATEGORIES = [...SEED_CATEGORIES, ...EXTRA_CATEGORIES];
const ALL_LIVE_SESSIONS = [...SEED_LIVE_SESSIONS, ...EXTRA_LIVE_SESSIONS];
const ALL_COURSES = [
  ...SEED_COURSES.map((course) => ({
    ...course,
    modules: course.modules.map((module) => ({
      ...module,
      lessons: [...module.lessons, ...(EXTRA_LESSONS[module.title] ?? [])],
    })),
  })),
  ...EXTRA_COURSES,
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function main() {
  console.log('🌱 Seeding database...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.$connect();

  const upsertUser = async (data: {
    email: string;
    name: string;
    password: string;
    role: string;
    referralCode: string;
  }) => {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      console.log(`ℹ️ User already exists: ${data.email}`);
      return existing;
    }
    const created = await prisma.user.create({
      data: {
        ...data,
        password: await bcrypt.hash(data.password, 10),
        isEmailVerified: true,
      },
    });
    console.log(`👤 User created: ${data.email} (${data.role})`);
    return created;
  };

  // 1. Users
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@josacademy.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const admin = await upsertUser({
    email: adminEmail,
    name: process.env.ADMIN_NAME || 'Super Admin',
    password: adminPassword,
    role: UserRole.ADMIN,
    referralCode: 'JOS-ADMIN',
  });

  // 2. Categories
  const categoryIds = new Map<string, string>();
  for (const category of ALL_CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
    categoryIds.set(category.name, record.id);
  }
  console.log(`📁 Categories ready: ${ALL_CATEGORIES.length}`);

  // 3. Courses, modules and lessons
  const courseIds = new Map<string, string>();
  for (const seedCourse of ALL_COURSES) {
    const existing = await prisma.course.findFirst({
      where: { name: seedCourse.name },
    });
    if (existing) {
      if (!existing.creatorId) {
        await prisma.course.update({
          where: { id: existing.id },
          data: { creatorId: admin.id },
        });
      }
      courseIds.set(seedCourse.name, existing.id);
      console.log(`ℹ️ Course already exists: ${seedCourse.name}`);
      continue;
    }

    const course = await prisma.course.create({
      data: {
        name: seedCourse.name,
        shortDescription: seedCourse.shortDescription,
        fullDescription: seedCourse.fullDescription,
        heroImageName: seedCourse.heroImageName,
        duration: seedCourse.duration,
        durationType:
          seedCourse.durationType === 'weeks'
            ? DurationType.weeks
            : DurationType.Months,
        targetLevel: TargetLevel[seedCourse.targetLevel],
        maxCohortSize: seedCourse.maxCohortSize,
        tuitionFee: seedCourse.tuitionFee,
        certificationOffered: true,
        capstoneRequired: true,
        careerSupportIncluded: true,
        categoryId: categoryIds.get(seedCourse.category),
        creatorId: admin.id,
        modules: {
          create: seedCourse.modules.map((module) => ({
            title: module.title,
            description: module.description,
            lessonsCount: module.lessons.length,
            lessons: {
              create: module.lessons.map((lesson, index) => ({
                title: lesson.title,
                contentType: LessonContentType[lesson.contentType],
                content: lesson.content,
                duration: lesson.duration,
                order: index,
              })),
            },
          })),
        },
      },
    });
    courseIds.set(seedCourse.name, course.id);
    console.log(`🎓 Course created: ${course.name}`);
  }

  // 4. Live sessions (only when the creator has none yet)
  const existingSessions = await prisma.liveSession.count({
    where: { creatorId: admin.id },
  });
  if (existingSessions === 0) {
    for (const session of ALL_LIVE_SESSIONS) {
      const courseId = courseIds.get(session.courseName);
      if (!courseId) continue;
      const scheduledAt = new Date(
        Date.now() + session.daysFromNow * MS_PER_DAY,
      );
      scheduledAt.setUTCHours(session.hourUtc, 0, 0, 0);
      await prisma.liveSession.create({
        data: {
          title: session.title,
          type: SessionType[session.type],
          platform: SessionPlatform[session.platform],
          scheduledAt,
          durationMins: session.durationMins,
          courseId,
          creatorId: admin.id,
        },
      });
    }
    console.log(`📅 Live sessions created: ${ALL_LIVE_SESSIONS.length}`);
  } else {
    console.log('ℹ️ Live sessions already exist');
  }

  // 5. Onboarding quiz (only when the admin has none yet)
  const existingQuestions = await prisma.assessmentQuestion.count();
  if (existingQuestions === 0) {
    await prisma.assessmentQuestion.createMany({
      data: SEED_ASSESSMENT_QUESTIONS.map((question, index) => ({
        subject: question.subject,
        prompt: question.prompt,
        options: question.options,
        order: index,
      })),
    });
    console.log(`📝 Assessment questions created: ${SEED_ASSESSMENT_QUESTIONS.length}`);
  } else {
    console.log('ℹ️ Assessment questions already exist');
  }

  console.log('\n=============================================');
  console.log('✨ SEEDING COMPLETE!');
  console.log(`🛡️ Admin: ${adminEmail} / ${adminPassword}`);
  console.log('=============================================\n');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error('❌ Error seeding database:', error);
  process.exit(1);
});
