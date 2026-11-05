import 'dotenv/config';
const { PrismaClient, UserRole } = require('../src/generated/prisma/client');
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { PASSWORD_HASH_ROUNDS } from '../src/auth/auth.constants';
import { generateReferralCode } from '../src/utils/generators';

// Admin-only seed: safe to run against production, unlike seed.ts which also inserts demo content.
async function main(): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== UserRole.ADMIN) {
        throw new Error(
          `${email} exists with role ${existing.role}; not changing it`,
        );
      }
      console.log(`ℹ️ Admin already exists: ${email}`);
      return;
    }

    await prisma.user.create({
      data: {
        email,
        name: ADMIN_NAME || 'Super Admin',
        password: await bcrypt.hash(ADMIN_PASSWORD, PASSWORD_HASH_ROUNDS),
        role: UserRole.ADMIN,
        isEmailVerified: true,
        referralCode: generateReferralCode(8, 'ADMIN'),
      },
    });
    console.log(`🛡️ Admin created: ${email}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Error seeding admin:', error);
  process.exit(1);
});
