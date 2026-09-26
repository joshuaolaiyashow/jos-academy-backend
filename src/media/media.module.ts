import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseAccessModule } from '../course-access/course-access.module';

@Module({
  imports: [PrismaModule, CourseAccessModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
