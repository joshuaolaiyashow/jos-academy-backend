import { Module } from '@nestjs/common';
import { DiscussionService } from './discussion.service';
import { DiscussionController } from './discussion.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LessonModule } from '../lesson/lesson.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, LessonModule, NotificationModule],
  providers: [DiscussionService],
  controllers: [DiscussionController],
})
export class DiscussionModule {}
