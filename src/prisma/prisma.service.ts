import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({
      connectionString,
      // Neon requires TLS; a local Docker Postgres (tests, dev) has none.
      // Ignored in production so a copied env var can never drop TLS there.
      ssl:
        process.env.DATABASE_SSL === 'false' &&
        process.env.NODE_ENV !== 'production'
          ? false
          : { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      // Step 1: Establish connection pool
      await this.$connect();

      // Step 2: Actively ping the database to verify it's responsive
      await this.$queryRaw`SELECT 1`;

      this.logger.log('🚀 Database connection established successfully.');
    } catch (error: any) {
      this.logger.error('❌ Failed to connect to the database.');
      this.logger.error(error?.stack || error?.message || error);

      // Gracefully terminate app if DB connection is mandatory on startup
      process.exit(1);
    }
  }

  async onModuleDestroy() {
    // Clean up connection when application shuts down
    await this.$disconnect();
  }
}
