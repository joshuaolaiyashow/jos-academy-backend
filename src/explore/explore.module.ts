import { Module } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { ExploreController } from './explore.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ExploreService],
  controllers: [ExploreController],
  exports: [ExploreService],
})
export class ExploreModule {}
