import 'dotenv/config';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';
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

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@josacademy.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const adminName = process.env.ADMIN_NAME || 'Super Admin';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
    if (existingAdmin.role !== UserRole.ADMIN) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: UserRole.ADMIN, isEmailVerified: true },
      });
      console.log(`✅ Updated existing user ${adminEmail} to ADMIN role.`);
    }
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isEmailVerified: true,
        referralCode: 'JOS-ADMIN',
      },
    });

    console.log('🎉 Admin account seeded successfully!');
    console.log(`   Email:    ${adminUser.email}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role:     ${adminUser.role}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Error seeding database:', e);
  process.exit(1);
});
