import 'dotenv/config';
const {
  PrismaClient,
  UserRole,
  DurationType,
  TargetLevel,
} = require('../src/generated/prisma/client');
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('🌱 Seeding database...');

  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();

  // 1. Seed Admin User
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@josacademy.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const adminName = process.env.ADMIN_NAME || 'Super Admin';

  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (adminUser) {
    console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
  } else {
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedAdminPassword,
        role: UserRole.ADMIN,
        isEmailVerified: true,
        referralCode: 'JOS-ADMIN',
      },
    });
    console.log('🎉 Admin account created successfully:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
  }

  // 2. Seed Student Test User
  const studentEmail = 'student@josacademy.com';
  const studentPassword = 'StudentPass123!';
  const studentName = 'Test Student';

  let studentUser = await prisma.user.findUnique({
    where: { email: studentEmail },
  });

  if (studentUser) {
    console.log(`ℹ️ Student test user already exists: ${studentEmail} (Credits: ${studentUser.credits})`);
  } else {
    const hashedStudentPassword = await bcrypt.hash(studentPassword, 10);
    studentUser = await prisma.user.create({
      data: {
        email: studentEmail,
        name: studentName,
        password: hashedStudentPassword,
        role: UserRole.USER,
        isEmailVerified: true,
        referralCode: 'JOS-STUDENT',
        credits: 2000, // Pre-funded with 2,000 credits (₦20,000) for instant testing
      },
    });
    console.log('🎉 Student test account created successfully:');
    console.log(`   Email:    ${studentEmail}`);
    console.log(`   Password: ${studentPassword}`);
    console.log(`   Credits:  2,000 (₦20,000)`);
  }

  // 3. Seed Category
  let category = await prisma.category.findUnique({
    where: { name: 'Software Engineering' },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'Software Engineering',
        description: 'Comprehensive courses on web development, backend APIs, and modern cloud stacks.',
      },
    });
    console.log(`📁 Category created: ${category.name} (ID: ${category.id})`);
  } else {
    console.log(`ℹ️ Category already exists: ${category.name} (ID: ${category.id})`);
  }

  // 4. Seed Course with 5 Modules
  const courseName = 'Full-Stack Web Development Bootcamp';
  let course = await prisma.course.findFirst({
    where: { name: courseName },
    include: { modules: true },
  });

  if (!course) {
    course = await prisma.course.create({
      data: {
        name: courseName,
        shortDescription: 'Master full-stack development with Node.js, NestJS, React, and PostgreSQL.',
        fullDescription:
          'Become a job-ready full-stack developer. Learn modern HTML/CSS, TypeScript, scalable backend architectures with NestJS and Prisma, database modeling, authentication, and deployment.',
        duration: 12,
        durationType: DurationType.weeks,
        targetLevel: TargetLevel.Foundation,
        maxCohortSize: 30,
        tuitionFee: 50000, // ₦50,000 (each module will be ₦10,000)
        certificationOffered: true,
        capstoneRequired: true,
        careerSupportIncluded: true,
        categoryId: category.id,
        heroImageName: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97',
        modules: {
          create: [
            {
              title: 'Module 1: HTML, CSS & Responsive Design',
              description: 'Learn the fundamentals of responsive layouts, Flexbox, CSS Grid, and semantic HTML5.',
              lessonsCount: 10,
              assignmentsCount: 3,
            },
            {
              title: 'Module 2: Modern JavaScript & TypeScript Fundamentals',
              description: 'Deep dive into ES6+, async/await, closures, TypeScript types, interfaces, and tooling.',
              lessonsCount: 12,
              assignmentsCount: 4,
            },
            {
              title: 'Module 3: Backend Architecture with NestJS & Express',
              description: 'Build REST APIs, manage dependency injection, middleware, guards, and DTO validations.',
              lessonsCount: 15,
              assignmentsCount: 5,
            },
            {
              title: 'Module 4: Database Modeling with PostgreSQL & Prisma',
              description: 'Design relational database schemas, transactions, migrations, and ORM query optimization.',
              lessonsCount: 10,
              assignmentsCount: 3,
            },
            {
              title: 'Module 5: Fullstack Deployment & DevOps Basics',
              description: 'Dockerize applications, deploy to cloud providers, configure CI/CD, and monitoring.',
              lessonsCount: 8,
              assignmentsCount: 2,
            },
          ],
        },
      },
      include: {
        modules: true,
      },
    });

    console.log(`🎓 Course seeded successfully: ${course.name}`);
    console.log(`   Course ID:    ${course.id}`);
    console.log(`   Tuition Fee:  ₦${course.tuitionFee.toLocaleString()} (Full Course)`);
    console.log(`   Total Modules: ${course.modules.length} (₦${(course.tuitionFee / course.modules.length).toLocaleString()} per module)`);
    course.modules.forEach((mod: any, index: number) => {
      console.log(`   ├─ Module ${index + 1}: ${mod.title} (ID: ${mod.id})`);
    });
  } else {
    console.log(`ℹ️ Course already exists: ${course.name} (ID: ${course.id})`);
  }

  console.log('\n=============================================');
  console.log('✨ SEEDING COMPLETE! TEST CREDENTIALS:');
  console.log('=============================================');
  console.log(`👤 Student Email:    ${studentEmail}`);
  console.log(`🔑 Student Password: ${studentPassword}`);
  console.log('---------------------------------------------');
  console.log(`🛡️ Admin Email:      ${adminEmail}`);
  console.log(`🔑 Admin Password:   ${adminPassword}`);
  console.log('---------------------------------------------');
  console.log(`📚 Course ID:        ${course.id}`);
  console.log('=============================================\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Error seeding database:', e);
  process.exit(1);
});
